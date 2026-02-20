import { randomUUID } from "node:crypto";
import { Queue, QueueEvents, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";
import { prismaStore } from "../data/prisma-store.js";
import { builtinTaskModules } from "./modules/index.js";

const normalizeQueueName = (value) => {
  const raw = String(value || "default").trim();
  return raw.replace(/[:\s/\\]+/g, "-") || "default";
};

const normalizeRepeatKey = (moduleId) => `repeat-${String(moduleId || "module").replace(/[^a-zA-Z0-9_.-]/g, "-")}`;

const buildRedisConnection = () => {
  const common = {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy: () => null
  };

  let client;
  if (env.redisUrl) {
    client = new IORedis(env.redisUrl, common);
  } else {
    client = new IORedis({
      host: env.redisHost,
      port: env.redisPort,
      password: env.redisPassword || undefined,
      db: env.redisDb,
      ...common
    });
  }
  client.on("error", () => undefined);
  return client;
};

const pickProxyIfNeeded = async (moduleConfig) => {
  if (!moduleConfig.useProxy) {
    return null;
  }
  return prismaStore.acquireProxyNode();
};

class TaskPlatform {
  constructor() {
    this.enabled = env.taskSystemEnabled;
    this.connection = null;
    this.queues = new Map();
    this.queueEvents = new Map();
    this.workers = new Map();
    this.moduleConfigs = new Map();
    this.started = false;
  }

  async start() {
    if (!this.enabled || this.started) {
      return;
    }
    try {
      this.connection = buildRedisConnection();
      await this.connection.connect();
      await this.connection.ping();
      await this.syncModules();
      this.started = true;
    } catch (err) {
      this.enabled = false;
      if (this.connection) {
        await this.connection.quit().catch(() => undefined);
        this.connection = null;
      }
      console.warn("[task-platform] disabled because redis is unavailable:", err?.message || err);
    }
  }

  async stop() {
    const closing = [];
    for (const worker of this.workers.values()) {
      closing.push(worker.close());
    }
    for (const events of this.queueEvents.values()) {
      closing.push(events.close());
    }
    for (const queue of this.queues.values()) {
      closing.push(queue.close());
    }
    await Promise.allSettled(closing);
    this.workers.clear();
    this.queueEvents.clear();
    this.queues.clear();
    this.moduleConfigs.clear();
    if (this.connection) {
      await this.connection.quit().catch(() => undefined);
      this.connection = null;
    }
    this.started = false;
  }

  async syncModules() {
    if (!this.connection) {
      return;
    }
    const rawModules = await prismaStore.listTaskModules();
    const modules = [];
    for (const rawModule of rawModules) {
      const normalizedQueueName = normalizeQueueName(rawModule.queueName);
      if (rawModule.queueName !== normalizedQueueName) {
        const updated = await prismaStore.updateTaskModule(rawModule.moduleId, { queueName: normalizedQueueName });
        modules.push(updated || { ...rawModule, queueName: normalizedQueueName });
      } else {
        modules.push(rawModule);
      }
    }
    this.moduleConfigs = new Map(modules.map((it) => [it.moduleId, it]));

    const queueNames = Array.from(new Set(modules.map((it) => normalizeQueueName(it.queueName))));
    for (const queueName of queueNames) {
      if (!this.queues.has(queueName)) {
        const queue = new Queue(queueName, { connection: this.connection });
        const events = new QueueEvents(queueName, { connection: this.connection });
        this.queues.set(queueName, queue);
        this.queueEvents.set(queueName, events);
      }
    }

    for (const [queueName, queue] of this.queues.entries()) {
      if (this.workers.has(queueName)) {
        continue;
      }
      const worker = new Worker(
        queueName,
        async (job) => {
          const moduleConfig = this.moduleConfigs.get(job.name);
          if (!moduleConfig || !moduleConfig.enabled) {
            throw new Error(`module disabled: ${job.name}`);
          }
          const runner = builtinTaskModules[job.name];
          if (!runner) {
            throw new Error(`module not implemented: ${job.name}`);
          }
          const proxy = await pickProxyIfNeeded(moduleConfig);
          await prismaStore.updateTaskRunByQueueJob(queueName, String(job.id), {
            state: "active",
            startedAt: new Date(),
            attemptsMade: job.attemptsMade,
            proxyId: proxy?.id || null
          });
          const result = await runner({ payload: job.data.payload || {}, meta: job.data.meta || {}, proxy, queueName, job });
          return result;
        },
        {
          connection: this.connection,
          concurrency: Math.max(
            1,
            ...modules.filter((it) => it.queueName === queueName && it.enabled).map((it) => it.concurrency || 1)
          )
        }
      );

      worker.on("completed", async (job, result) => {
        await prismaStore.updateTaskRunByQueueJob(queueName, String(job.id), {
          state: "completed",
          progress: 100,
          result,
          finishedAt: new Date(),
          attemptsMade: job.attemptsMade
        });
        const orderGroupId = job?.data?.meta?.orderGroupId;
        const orderItemId = job?.data?.meta?.orderItemId;
        if (orderGroupId) {
          await prismaStore.refreshOrderStatus(orderGroupId);
        } else if (orderItemId) {
          const orderItem = await prismaStore.getOrderItemById(orderItemId);
          if (orderItem?.groupId) {
            await prismaStore.refreshOrderStatus(orderItem.groupId);
          }
        }
      });

      worker.on("failed", async (job, err) => {
        if (!job) {
          return;
        }
        await prismaStore.updateTaskRunByQueueJob(queueName, String(job.id), {
          state: "failed",
          error: err?.message || "failed",
          finishedAt: new Date(),
          attemptsMade: job.attemptsMade
        });

        const orderItemId = job?.data?.meta?.orderItemId;
        if (orderItemId) {
          const orderItem = await prismaStore.getOrderItemById(orderItemId);
          if (orderItem && orderItem.status !== "CANCELLED") {
            await prismaStore.updateOrderItem(orderItemId, {
              executionStatus: "FAILED",
              status: "FAILED"
            });
            await prismaStore.refreshOrderStatus(orderItem.groupId);
          }
        }
      });

      this.workers.set(queueName, worker);

      const queueModules = modules.filter((it) => normalizeQueueName(it.queueName) === queueName && it.category === "SCHEDULED");
      for (const moduleConfig of queueModules) {
        const repeatKey = normalizeRepeatKey(moduleConfig.moduleId);
        if (!moduleConfig.enabled || !moduleConfig.schedule) {
          await queue.removeRepeatable(moduleConfig.moduleId, { pattern: moduleConfig.schedule || "* * * * *" }, repeatKey).catch(() => undefined);
          continue;
        }
        await queue.add(
          moduleConfig.moduleId,
          { payload: {}, meta: { source: "scheduler" } },
          {
            jobId: repeatKey,
            attempts: moduleConfig.attempts,
            backoff: { type: "fixed", delay: moduleConfig.backoffMs },
            repeat: { pattern: moduleConfig.schedule }
          }
        );
      }
    }
  }

  async enqueueModule(moduleId, payload = {}, meta = {}) {
    if (!this.enabled || !this.connection) {
      throw new Error("Task platform is disabled");
    }
    const moduleConfig = this.moduleConfigs.get(moduleId) || await prismaStore.getTaskModuleByModuleId(moduleId);
    if (!moduleConfig) {
      throw new Error(`module not found: ${moduleId}`);
    }
    if (!moduleConfig.enabled) {
      throw new Error(`module disabled: ${moduleId}`);
    }
    const queueName = normalizeQueueName(moduleConfig.queueName);
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`queue not found: ${queueName}`);
    }
    const job = await queue.add(
      moduleId,
      { payload, meta },
      {
        jobId: `${moduleId}.${randomUUID()}`,
        attempts: moduleConfig.attempts,
        backoff: { type: "fixed", delay: moduleConfig.backoffMs },
        removeOnComplete: false,
        removeOnFail: false
      }
    );
    const run = await prismaStore.createTaskRun({
      moduleId,
      queueName,
      jobId: String(job.id),
      state: "waiting",
      payload,
      orderGroupId: meta.orderGroupId,
      orderItemId: meta.orderItemId
    });
    return { jobId: String(job.id), queueName, run };
  }

  async listQueues() {
    const result = [];
    for (const [queueName, queue] of this.queues.entries()) {
      const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
      result.push({ queueName, ...counts });
    }
    return result;
  }

  async pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return false;
    }
    await queue.pause();
    return true;
  }

  async resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return false;
    }
    await queue.resume();
    return true;
  }

  async listJobs(queueName, status = "waiting", limit = 20) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return [];
    }
    const jobs = await queue.getJobs([status], 0, Math.max(1, limit) - 1, true);
    return jobs.map((job) => ({
      id: String(job.id),
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    }));
  }
}

export const taskPlatform = new TaskPlatform();
