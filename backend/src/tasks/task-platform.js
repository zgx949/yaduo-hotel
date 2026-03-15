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

const withTimeout = async (promise, timeoutMs, message) => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message || "timeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const parseMaybeJson = (value) => {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const isDuplicateJobError = (err) => {
  const message = String(err?.message || "").toLowerCase();
  return message.includes("jobid") && (message.includes("exists") || message.includes("duplic"));
};

const isUniqueConstraintError = (err) => {
  const message = String(err?.message || "").toLowerCase();
  return message.includes("unique") && message.includes("constraint");
};

const buildRedisClient = (label) => {
  const common = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    keepAlive: 10_000,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(250 * (2 ** Math.min(times, 8)), 30_000),
    connectionName: `task:${label}`
  };

  const client = env.redisUrl
    ? new IORedis(env.redisUrl, common)
    : new IORedis({
      host: env.redisHost,
      port: env.redisPort,
      password: env.redisPassword || undefined,
      db: env.redisDb,
      ...common
    });

  client.on("error", (err) => {
    console.warn("[task-platform][redis]", label, err?.message || err);
  });
  client.on("end", () => {
    if (env.nodeEnv !== "production") {
      console.warn("[task-platform][redis]", label, "connection ended");
    }
  });
  client.on("reconnecting", () => {
    if (env.nodeEnv !== "production") {
      console.warn("[task-platform][redis]", label, "reconnecting");
    }
  });

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
    this.consumeEnabled = true;
    this.workerMode = env.taskWorkerMode;
    this.adminConnection = null;
    this.redisClients = new Set();
    this.queues = new Map();
    this.queueEvents = new Map();
    this.workers = new Map();
    this.moduleConfigs = new Map();
    this.started = false;
    this.maintenanceTimer = null;
    this.healthTimer = null;
    this.reconcileTimer = null;
    this.syncing = null;
    this.reconciling = false;
    this.recovering = false;
    this.redisHealthFailures = 0;
    this.queueIdleCounters = new Map();
    this.lastSelfHeal = {
      inProgress: false,
      lastAttemptAtMs: null,
      lastSuccessAtMs: null,
      lastResult: "never",
      lastReason: null,
      lastDurationMs: null,
      consecutiveFailures: 0,
      totalRecoveries: 0,
      lastError: null
    };
  }

  createRedisClient(label) {
    const client = buildRedisClient(label);
    this.redisClients.add(client);
    return client;
  }

  shouldConsumeModule(moduleConfig) {
    if (!this.consumeEnabled) {
      return false;
    }
    const mode = String(this.workerMode || "all").toLowerCase();
    const category = String(moduleConfig?.category || "REALTIME").toUpperCase();
    if (mode === "realtime") {
      return category === "REALTIME";
    }
    if (mode === "scheduled") {
      return category === "SCHEDULED";
    }
    return true;
  }

  async syncModulesSafe() {
    if (this.syncing) {
      return this.syncing;
    }
    this.syncing = this.syncModules().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  startMaintenanceLoop() {
    if (this.maintenanceTimer || !this.started || !this.consumeEnabled) {
      return;
    }
    const intervalMs = Math.max(1000, Number(env.taskPollIntervalMs) || 5000);
    this.maintenanceTimer = setInterval(() => {
      this.syncModulesSafe().catch((err) => {
        console.warn("[task-platform] periodic sync failed:", err?.message || err);
      });
    }, intervalMs);
    this.maintenanceTimer.unref?.();
  }

  startHealthLoop() {
    if (this.healthTimer || !this.started || !this.consumeEnabled) {
      return;
    }
    const intervalMs = Math.max(5000, Number(env.taskPollIntervalMs) * 2 || 10_000);
    this.healthTimer = setInterval(() => {
      this.ensureHealthy().catch((err) => {
        console.warn("[task-platform] health check failed:", err?.message || err);
      });
    }, intervalMs);
    this.healthTimer.unref?.();
  }

  startReconcileLoop() {
    if (this.reconcileTimer || !this.started || !this.consumeEnabled) {
      return;
    }
    const intervalMs = Math.max(10_000, Number(env.taskPollIntervalMs) * 3 || 15_000);
    this.reconcileTimer = setInterval(() => {
      this.reconcileRunsSafe().catch((err) => {
        console.warn("[task-platform] reconcile failed:", err?.message || err);
      });
    }, intervalMs);
    this.reconcileTimer.unref?.();
  }

  async start(options = {}) {
    if (!this.enabled || this.started) {
      return;
    }
    this.consumeEnabled = options.consume !== false;
    this.workerMode = String(options.workerMode || env.taskWorkerMode || "all").toLowerCase();

    try {
      this.adminConnection = this.createRedisClient("admin");
      await withTimeout(this.adminConnection.ping(), 5000, "redis ping timeout");
      await this.syncModulesSafe();
      this.started = true;
      if (this.consumeEnabled) {
        this.startMaintenanceLoop();
        this.startHealthLoop();
        this.startReconcileLoop();
      }
    } catch (err) {
      const strictMode = options.strict === true;
      await this.stop();
      console.warn("[task-platform] redis unavailable during startup:", err?.message || err);
      if (strictMode) {
        throw err;
      }
    }
  }

  async stop() {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
    }
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }

    const closing = [];
    for (const worker of this.workers.values()) {
      closing.push(worker.close().catch(() => undefined));
    }
    for (const events of this.queueEvents.values()) {
      closing.push(events.close().catch(() => undefined));
    }
    for (const queue of this.queues.values()) {
      closing.push(queue.close().catch(() => undefined));
    }
    await Promise.allSettled(closing);

    this.workers.clear();
    this.queueEvents.clear();
    this.queues.clear();
    this.moduleConfigs.clear();
    this.queueIdleCounters.clear();

    const closingRedis = [];
    for (const client of this.redisClients.values()) {
      closingRedis.push(client.quit().catch(() => client.disconnect()));
    }
    await Promise.allSettled(closingRedis);
    this.redisClients.clear();
    this.adminConnection = null;
    this.redisHealthFailures = 0;
    this.started = false;
  }

  async ensureHealthy() {
    if (this.recovering || !this.consumeEnabled) {
      return;
    }
    if (!this.adminConnection) {
      await this.recoverPlatform("admin redis connection missing");
      return;
    }

    try {
      await withTimeout(this.adminConnection.ping(), 3000, "redis health ping timeout");
      this.redisHealthFailures = 0;
    } catch (err) {
      this.redisHealthFailures += 1;
      if (this.redisHealthFailures >= 2) {
        await this.recoverPlatform(`redis unhealthy: ${err?.message || err}`);
      }
      return;
    }

    for (const [queueName, queue] of this.queues.entries()) {
      if (!this.workers.has(queueName)) {
        continue;
      }
      const counts = await queue.getJobCounts("waiting", "active");
      const hasBacklogNoActive = (Number(counts.waiting) || 0) > 0 && (Number(counts.active) || 0) === 0;
      if (hasBacklogNoActive) {
        const idleCount = (this.queueIdleCounters.get(queueName) || 0) + 1;
        this.queueIdleCounters.set(queueName, idleCount);
        if (idleCount >= 3) {
          await this.recoverPlatform(`queue ${queueName} waiting backlog without active workers`);
          return;
        }
      } else {
        this.queueIdleCounters.set(queueName, 0);
      }
    }
  }

  async recoverPlatform(reason) {
    if (this.recovering) {
      return;
    }
    const attemptStartedAt = Date.now();
    const normalizedReason = String(reason || "unknown").slice(0, 240);
    this.lastSelfHeal.inProgress = true;
    this.lastSelfHeal.lastAttemptAtMs = attemptStartedAt;
    this.lastSelfHeal.lastReason = normalizedReason;
    this.lastSelfHeal.lastDurationMs = null;
    this.lastSelfHeal.lastError = null;
    this.recovering = true;
    console.warn("[task-platform] self-heal restart triggered:", normalizedReason);
    try {
      const consume = this.consumeEnabled;
      const mode = this.workerMode;
      await this.stop();
      await this.start({ consume, strict: true, workerMode: mode });
      this.lastSelfHeal.inProgress = false;
      this.lastSelfHeal.lastResult = "success";
      this.lastSelfHeal.lastSuccessAtMs = Date.now();
      this.lastSelfHeal.lastDurationMs = Date.now() - attemptStartedAt;
      this.lastSelfHeal.consecutiveFailures = 0;
      this.lastSelfHeal.totalRecoveries += 1;
    } catch (err) {
      this.lastSelfHeal.inProgress = false;
      this.lastSelfHeal.lastResult = "fail";
      this.lastSelfHeal.lastDurationMs = Date.now() - attemptStartedAt;
      this.lastSelfHeal.consecutiveFailures += 1;
      this.lastSelfHeal.lastError = {
        name: String(err?.name || "Error"),
        message: String(err?.message || "self-heal failed").slice(0, 240)
      };
      console.error("[task-platform] self-heal restart failed:", err?.message || err);
    } finally {
      this.recovering = false;
      this.lastSelfHeal.inProgress = false;
    }
  }

  getRuntimeSnapshot() {
    return {
      enabled: this.enabled,
      started: this.started,
      consumeEnabled: this.consumeEnabled,
      workerMode: this.workerMode,
      queueCount: this.queues.size,
      workerCount: this.workers.size,
      queueEventCount: this.queueEvents.size,
      recovering: this.recovering,
      redisHealthFailures: this.redisHealthFailures,
      selfHeal: {
        inProgress: this.lastSelfHeal.inProgress,
        lastAttemptAt: this.lastSelfHeal.lastAttemptAtMs ? new Date(this.lastSelfHeal.lastAttemptAtMs).toISOString() : null,
        lastSuccessAt: this.lastSelfHeal.lastSuccessAtMs ? new Date(this.lastSelfHeal.lastSuccessAtMs).toISOString() : null,
        lastResult: this.lastSelfHeal.lastResult,
        lastReason: this.lastSelfHeal.lastReason,
        lastDurationMs: this.lastSelfHeal.lastDurationMs,
        consecutiveFailures: this.lastSelfHeal.consecutiveFailures,
        totalRecoveries: this.lastSelfHeal.totalRecoveries,
        lastError: this.lastSelfHeal.lastError
      }
    };
  }

  async getHealthSnapshot() {
    const now = new Date().toISOString();
    const runtime = this.getRuntimeSnapshot();
    if (!runtime.enabled) {
      return {
        status: "disabled",
        time: now,
        tasks: {
          ...runtime,
          worker: {
            ready: false,
            runningWorkers: runtime.workerCount,
            knownWorkers: runtime.workerCount,
            notes: ["task system disabled"]
          },
          queues: {
            snapshotAt: now,
            totals: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
            byQueue: [],
            truncated: false,
            error: null
          }
        }
      };
    }

    const notes = [];
    if (!runtime.started) {
      notes.push("task platform not started");
    }
    if (!runtime.consumeEnabled) {
      notes.push("consume disabled");
    }
    if (runtime.recovering) {
      notes.push("self-heal in progress");
    }

    let queueItems = [];
    let queueError = null;
    try {
      queueItems = await withTimeout(this.listQueues(), 2000, "listQueues timeout");
    } catch (err) {
      queueError = String(err?.message || "failed to query queues").slice(0, 240);
      notes.push("queue snapshot unavailable");
    }

    const totals = queueItems.reduce((acc, item) => ({
      waiting: acc.waiting + Number(item.waiting || 0),
      active: acc.active + Number(item.active || 0),
      completed: acc.completed + Number(item.completed || 0),
      failed: acc.failed + Number(item.failed || 0),
      delayed: acc.delayed + Number(item.delayed || 0),
      paused: acc.paused + Number(item.paused || 0)
    }), { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 });

    const workerReady = runtime.started && runtime.consumeEnabled && runtime.workerCount > 0;
    const hasStuckSignal = totals.waiting > 0 && totals.active === 0 && runtime.workerCount === 0;
    if (hasStuckSignal) {
      notes.push("waiting backlog without active workers");
    }

    let status = "ok";
    if (!workerReady || queueError) {
      status = "down";
    } else if (runtime.recovering || runtime.redisHealthFailures > 0 || hasStuckSignal || totals.failed > 0) {
      status = "degraded";
    }

    return {
      status,
      time: now,
      tasks: {
        ...runtime,
        worker: {
          ready: workerReady,
          runningWorkers: runtime.workerCount,
          knownWorkers: runtime.workerCount,
          notes
        },
        queues: {
          snapshotAt: now,
          totals,
          byQueue: queueItems.map((item) => ({
            name: item.queueName,
            waiting: Number(item.waiting || 0),
            active: Number(item.active || 0),
            completed: Number(item.completed || 0),
            failed: Number(item.failed || 0),
            delayed: Number(item.delayed || 0),
            paused: Number(item.paused || 0)
          })),
          truncated: false,
          error: queueError
        }
      }
    };
  }

  async refreshRelatedOrderStatus({ orderGroupId, orderItemId }) {
    if (orderGroupId) {
      await prismaStore.refreshOrderStatus(orderGroupId);
      return;
    }
    if (!orderItemId) {
      return;
    }
    const orderItem = await prismaStore.getOrderItemById(orderItemId);
    if (orderItem?.groupId) {
      await prismaStore.refreshOrderStatus(orderItem.groupId);
    }
  }

  async markOrderItemFailed(orderItemId) {
    if (!orderItemId) {
      return;
    }
    const orderItem = await prismaStore.getOrderItemById(orderItemId);
    if (!orderItem || orderItem.status === "CANCELLED") {
      return;
    }
    if (orderItem.atourOrderId || ["ORDERED", "DONE"].includes(String(orderItem.executionStatus || ""))) {
      return;
    }
    await prismaStore.updateOrderItem(orderItemId, {
      executionStatus: "FAILED",
      status: "FAILED"
    });
    await prismaStore.refreshOrderStatus(orderItem.groupId);
  }

  bindQueueEvents(queueName, events) {
    events.on("error", (err) => {
      console.warn("[task-platform] queue events error:", queueName, err?.message || err);
    });

    events.on("stalled", async ({ jobId }) => {
      if (!jobId) {
        return;
      }
      await prismaStore.updateTaskRunByQueueJob(queueName, String(jobId), {
        state: "waiting",
        error: "job stalled and moved back to waiting"
      });
    });

    events.on("completed", async ({ jobId, returnvalue }) => {
      if (!jobId) {
        return;
      }
      const run = await prismaStore.getTaskRunByQueueJob(queueName, String(jobId));
      if (!run || run.state === "completed") {
        return;
      }
      await prismaStore.updateTaskRunByQueueJob(queueName, String(jobId), {
        state: "completed",
        progress: 100,
        result: parseMaybeJson(returnvalue),
        finishedAt: new Date()
      });
      await this.refreshRelatedOrderStatus({
        orderGroupId: run.orderGroupId,
        orderItemId: run.orderItemId
      });
    });

    events.on("failed", async ({ jobId, failedReason }) => {
      if (!jobId) {
        return;
      }
      const run = await prismaStore.getTaskRunByQueueJob(queueName, String(jobId));
      if (!run || run.state === "failed") {
        return;
      }
      await prismaStore.updateTaskRunByQueueJob(queueName, String(jobId), {
        state: "failed",
        error: String(failedReason || "failed"),
        finishedAt: new Date()
      });
      await this.markOrderItemFailed(run.orderItemId);
    });
  }

  bindWorkerEvents(queueName, worker) {
    worker.on("error", (err) => {
      console.warn("[task-platform] worker error:", queueName, err?.message || err);
    });

    worker.on("stalled", async (jobId) => {
      if (!jobId) {
        return;
      }
      await prismaStore.updateTaskRunByQueueJob(queueName, String(jobId), {
        state: "waiting",
        error: "job stalled and moved back to waiting"
      });
    });

    worker.on("completed", async (job, result) => {
      await prismaStore.updateTaskRunByQueueJob(queueName, String(job.id), {
        state: "completed",
        progress: 100,
        result,
        finishedAt: new Date(),
        attemptsMade: job.attemptsMade
      });
      await this.refreshRelatedOrderStatus({
        orderGroupId: job?.data?.meta?.orderGroupId,
        orderItemId: job?.data?.meta?.orderItemId
      });
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
      await this.markOrderItemFailed(job?.data?.meta?.orderItemId);
    });
  }

  async syncModules() {
    if (!this.adminConnection) {
      return;
    }
    await prismaStore.ensureTaskModuleDefaults();
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

    const activeModules = modules.filter((it) => this.shouldConsumeModule(it));
    const queueNames = Array.from(new Set(modules.map((it) => normalizeQueueName(it.queueName))));
    const consumeQueueNames = new Set(activeModules.map((it) => normalizeQueueName(it.queueName)));

    for (const queueName of queueNames) {
      if (!this.queues.has(queueName)) {
        const queue = new Queue(queueName, { connection: this.createRedisClient(`queue:${queueName}`) });
        this.queues.set(queueName, queue);
      }
    }

    for (const [queueName, queue] of this.queues.entries()) {
      const shouldConsumeQueue = this.consumeEnabled && consumeQueueNames.has(queueName);

      if (!shouldConsumeQueue) {
        const oldWorker = this.workers.get(queueName);
        if (oldWorker) {
          await oldWorker.close().catch(() => undefined);
          this.workers.delete(queueName);
        }
        const oldEvents = this.queueEvents.get(queueName);
        if (oldEvents) {
          await oldEvents.close().catch(() => undefined);
          this.queueEvents.delete(queueName);
        }
        continue;
      }

      if (!this.queueEvents.has(queueName)) {
        const events = new QueueEvents(queueName, { connection: this.createRedisClient(`events:${queueName}`) });
        this.bindQueueEvents(queueName, events);
        await events.waitUntilReady();
        this.queueEvents.set(queueName, events);
      }

      if (!this.workers.has(queueName)) {
        const worker = new Worker(
          queueName,
          async (job) => {
            const moduleConfig = this.moduleConfigs.get(job.name);
            if (!moduleConfig || !moduleConfig.enabled || !this.shouldConsumeModule(moduleConfig)) {
              throw new Error(`module disabled for this worker: ${job.name}`);
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
            return runner({
              payload: job.data.payload || {},
              meta: job.data.meta || {},
              proxy,
              queueName,
              job
            });
          },
          {
            connection: this.createRedisClient(`worker:${queueName}`),
            concurrency: Math.max(
              1,
              ...activeModules
                .filter((it) => normalizeQueueName(it.queueName) === queueName && it.enabled)
                .map((it) => it.concurrency || 1)
            )
          }
        );
        this.bindWorkerEvents(queueName, worker);
        await worker.waitUntilReady();
        this.workers.set(queueName, worker);
      }

      const queueModules = activeModules.filter(
        (it) => normalizeQueueName(it.queueName) === queueName && it.category === "SCHEDULED"
      );
      for (const moduleConfig of queueModules) {
        const repeatKey = normalizeRepeatKey(moduleConfig.moduleId);
        const schedulePattern = String(moduleConfig.schedule || "").trim();

        if (!moduleConfig.enabled || !schedulePattern) {
          if (typeof queue.removeJobScheduler === "function") {
            await queue.removeJobScheduler(repeatKey).catch(() => undefined);
          } else {
            await queue.removeRepeatableByKey(repeatKey).catch(() => undefined);
          }
          continue;
        }

        if (typeof queue.upsertJobScheduler === "function") {
          await queue.upsertJobScheduler(
            repeatKey,
            { pattern: schedulePattern },
            {
              name: moduleConfig.moduleId,
              data: { payload: {}, meta: { source: "scheduler" } },
              opts: {
                attempts: moduleConfig.attempts,
                backoff: { type: "fixed", delay: moduleConfig.backoffMs }
              }
            }
          );
          continue;
        }

        await queue.add(
          moduleConfig.moduleId,
          { payload: {}, meta: { source: "scheduler" } },
          {
            jobId: repeatKey,
            attempts: moduleConfig.attempts,
            backoff: { type: "fixed", delay: moduleConfig.backoffMs },
            repeat: { pattern: schedulePattern }
          }
        );
      }
    }
  }

  async reconcileRunsSafe() {
    if (this.reconciling || !this.consumeEnabled) {
      return;
    }
    this.reconciling = true;
    try {
      for (const [queueName, queue] of this.queues.entries()) {
        if (!this.workers.has(queueName)) {
          continue;
        }
        const waitingRuns = await prismaStore.listTaskRuns({ queueName, state: "waiting", limit: 100 });
        const activeRuns = await prismaStore.listTaskRuns({ queueName, state: "active", limit: 100 });
        const runs = [...waitingRuns, ...activeRuns];
        for (const run of runs) {
          const job = await queue.getJob(String(run.jobId));
          if (!job) {
            const ageMs = Date.now() - new Date(run.updatedAt).getTime();
            if (ageMs > 120_000) {
              await prismaStore.updateTaskRunByQueueJob(queueName, String(run.jobId), {
                state: "failed",
                error: "job not found in queue during reconcile",
                finishedAt: new Date()
              });
              await this.markOrderItemFailed(run.orderItemId);
            }
            continue;
          }

          const state = await job.getState();
          if (state === "completed" && run.state !== "completed") {
            await prismaStore.updateTaskRunByQueueJob(queueName, String(run.jobId), {
              state: "completed",
              progress: 100,
              result: parseMaybeJson(job.returnvalue),
              finishedAt: job.finishedOn ? new Date(job.finishedOn) : new Date(),
              attemptsMade: job.attemptsMade
            });
            await this.refreshRelatedOrderStatus({
              orderGroupId: run.orderGroupId,
              orderItemId: run.orderItemId
            });
            continue;
          }

          if (state === "failed" && run.state !== "failed") {
            await prismaStore.updateTaskRunByQueueJob(queueName, String(run.jobId), {
              state: "failed",
              error: job.failedReason ? String(job.failedReason) : "failed",
              finishedAt: job.finishedOn ? new Date(job.finishedOn) : new Date(),
              attemptsMade: job.attemptsMade
            });
            await this.markOrderItemFailed(run.orderItemId);
            continue;
          }

          if (state === "active" && run.state !== "active") {
            await prismaStore.updateTaskRunByQueueJob(queueName, String(run.jobId), {
              state: "active",
              attemptsMade: job.attemptsMade,
              startedAt: job.processedOn ? new Date(job.processedOn) : new Date()
            });
            continue;
          }

          if (["waiting", "delayed", "paused"].includes(state) && run.state !== "waiting") {
            await prismaStore.updateTaskRunByQueueJob(queueName, String(run.jobId), {
              state: "waiting",
              error: null
            });
          }
        }
      }
    } finally {
      this.reconciling = false;
    }
  }

  async enqueueModule(moduleId, payload = {}, meta = {}, options = {}) {
    if (!this.enabled || !this.adminConnection) {
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
    if (!this.queues.has(queueName)) {
      await this.syncModulesSafe();
    }
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`queue not found: ${queueName}`);
    }

    const providedJobId = String(options?.jobId || "").trim();
    const orderItemJobId = moduleId === "order.submit" && meta?.orderItemId
      ? `${moduleId}:${String(meta.orderItemId)}`
      : "";
    const finalJobId = providedJobId || orderItemJobId || `${moduleId}.${randomUUID()}`;

    let job;
    try {
      job = await queue.add(
        moduleId,
        { payload, meta },
        {
          jobId: finalJobId,
          attempts: moduleConfig.attempts,
          backoff: { type: "fixed", delay: moduleConfig.backoffMs },
          removeOnComplete: false,
          removeOnFail: false
        }
      );
    } catch (err) {
      if (!isDuplicateJobError(err)) {
        throw err;
      }
      const existing = await queue.getJob(finalJobId);
      if (!existing) {
        throw err;
      }
      job = existing;
    }

    let run = null;
    try {
      run = await prismaStore.createTaskRun({
        moduleId,
        queueName,
        jobId: String(job.id),
        state: "waiting",
        payload,
        orderGroupId: meta.orderGroupId,
        orderItemId: meta.orderItemId
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) {
        throw err;
      }
      run = await prismaStore.getTaskRunByQueueJob(queueName, String(job.id));
    }

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
    const allowedStates = new Set(["waiting", "active", "completed", "failed", "delayed", "paused"]);
    const statuses = String(status || "waiting")
      .split(",")
      .map((it) => it.trim())
      .filter((it) => Boolean(it) && allowedStates.has(it));
    const jobs = await queue.getJobs(statuses.length > 0 ? statuses : ["waiting"], 0, Math.max(1, limit) - 1, true);
    return jobs.map((job) => ({
      id: String(job.id),
      name: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason ? String(job.failedReason).slice(0, 2000) : null,
      stacktrace: Array.isArray(job.stacktrace) ? job.stacktrace.map((it) => String(it).slice(0, 4000)) : [],
      returnvalue: job.returnvalue,
      opts: job.opts,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    }));
  }
}

export const taskPlatform = new TaskPlatform();
