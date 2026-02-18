import { Router } from "express";
import { prismaStore } from "../data/prisma-store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getInternalRequestContext } from "../services/internal-resource.service.js";
import { listConfiguredModels, runLlmCompletion } from "../services/langchain-llm.service.js";
import { taskPlatform } from "../tasks/task-platform.js";

export const systemRoutes = Router();

systemRoutes.get("/config", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const config = await prismaStore.getSystemConfig();
  return res.json({
    ...config,
    proxyStats: {
      total: config.proxies.length,
      online: config.proxies.filter((it) => it.status === "ONLINE").length,
      offline: config.proxies.filter((it) => it.status === "OFFLINE").length
    }
  });
});

systemRoutes.put("/config", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const next = await prismaStore.updateSystemConfig(req.body || {});
  return res.json(next);
});

systemRoutes.get("/proxies", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await prismaStore.listProxyNodes();
  return res.json({ items });
});

systemRoutes.post("/proxies", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { ip, port } = req.body || {};
  if (!ip || !port) {
    return res.status(400).json({ message: "ip and port are required" });
  }
  const created = await prismaStore.createProxyNode(req.body || {});
  return res.status(201).json(created);
});

systemRoutes.patch("/proxies/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const next = await prismaStore.updateProxyNode(req.params.id, req.body || {});
  if (!next) {
    return res.status(404).json({ message: "proxy node not found" });
  }
  return res.json(next);
});

systemRoutes.delete("/proxies/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const deleted = await prismaStore.deleteProxyNode(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "proxy node not found" });
  }
  return res.status(204).send();
});

systemRoutes.post("/proxies/:id/check", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const exists = await prismaStore.getProxyNode(req.params.id);
  if (!exists) {
    return res.status(404).json({ message: "proxy node not found" });
  }

  const latency = Math.floor(Math.random() * 350) + 40;
  const status = latency > 280 ? "LATENCY" : "ONLINE";
  const updated = await prismaStore.markProxyHealth(req.params.id, status);
  return res.json({ ...updated, latencyMs: latency });
});

systemRoutes.get("/internal-proxy", requireAuth, async (req, res) => {
  const ctx = await getInternalRequestContext({
    tier: req.query.tier,
    proxyType: req.query.type
  });

  return res.json({
    tokenSource: ctx.tokenSource,
    tokenAccountId: ctx.tokenAccountId,
    proxy: ctx.proxy
      ? {
        id: ctx.proxy.id,
        endpoint: `${ctx.proxy.ip}:${ctx.proxy.port}`,
        type: ctx.proxy.type,
        status: ctx.proxy.status
      }
      : null
  });
});

systemRoutes.get("/llm/models", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const models = await listConfiguredModels();
  return res.json({
    items: models.map((it) => ({
      ...it,
      apiKey: it.apiKey ? `${it.apiKey.slice(0, 6)}***` : ""
    }))
  });
});

systemRoutes.post("/llm/test", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { prompt, modelId, systemPrompt } = req.body || {};
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) {
    return res.status(400).json({ message: "prompt is required" });
  }

  try {
    const result = await runLlmCompletion({
      prompt: normalizedPrompt,
      modelId: modelId ? String(modelId) : undefined,
      systemPrompt: systemPrompt ? String(systemPrompt) : undefined
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err.message || "LLM test failed" });
  }
});

systemRoutes.get("/tasks/modules", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await prismaStore.listTaskModules();
  return res.json({ items });
});

systemRoutes.patch("/tasks/modules/:moduleId", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const updated = await prismaStore.updateTaskModule(req.params.moduleId, req.body || {});
  if (!updated) {
    return res.status(404).json({ message: "task module not found" });
  }
  await taskPlatform.syncModules();
  return res.json(updated);
});

systemRoutes.post("/tasks/modules/:moduleId/run-now", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const data = await taskPlatform.enqueueModule(req.params.moduleId, req.body?.payload || {}, { source: "manual" });
    return res.status(201).json(data);
  } catch (err) {
    return res.status(400).json({ message: err.message || "enqueue failed" });
  }
});

systemRoutes.get("/tasks/runs", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await prismaStore.listTaskRuns({
    moduleId: req.query.moduleId,
    queueName: req.query.queueName,
    state: req.query.state,
    limit: req.query.limit
  });
  return res.json({ items });
});

systemRoutes.get("/tasks/queues", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await taskPlatform.listQueues();
  return res.json({ items });
});

systemRoutes.post("/tasks/queues/:queueName/pause", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const ok = await taskPlatform.pauseQueue(req.params.queueName);
  if (!ok) {
    return res.status(404).json({ message: "queue not found" });
  }
  return res.json({ ok: true });
});

systemRoutes.post("/tasks/queues/:queueName/resume", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const ok = await taskPlatform.resumeQueue(req.params.queueName);
  if (!ok) {
    return res.status(404).json({ message: "queue not found" });
  }
  return res.json({ ok: true });
});

systemRoutes.get("/tasks/queues/:queueName/jobs", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await taskPlatform.listJobs(
    req.params.queueName,
    req.query.state ? String(req.query.state) : "waiting",
    req.query.limit ? Number(req.query.limit) : 20
  );
  return res.json({ items });
});
