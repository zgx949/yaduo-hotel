import { Router } from "express";
import { prismaStore } from "../data/prisma-store.js";
import { requireAuth } from "../middleware/auth.js";
import {
  runCouponScanTask,
  runDailyCheckinTask,
  runDailyLotteryTask,
  runPointsScanTask,
  runTokenRefreshTask
} from "../services/atour-maintenance.service.js";

export const poolRoutes = Router();

const toBooleanOrUndefined = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return undefined;
};

const validateCreatePayload = (payload) => {
  if (!payload.phone) {
    return "phone is required";
  }
  if (!payload.token) {
    return "token is required";
  }
  if (payload.corporate_agreements !== undefined && !Array.isArray(payload.corporate_agreements)) {
    return "corporate_agreements must be an array";
  }
  return null;
};

const validatePatchPayload = (payload) => {
  if (Object.keys(payload).length === 0) {
    return "patch body cannot be empty";
  }
  if (payload.corporate_agreements !== undefined && !Array.isArray(payload.corporate_agreements)) {
    return "corporate_agreements must be an array";
  }
  return null;
};

const toCorporateAgreements = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((it, idx) => ({
        id: String(it?.id || `corp-${idx + 1}`),
        name: String(it?.name || "").trim(),
        enabled: it?.enabled !== false
      }))
      .filter((it) => it.name);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,，、|]/)
      .map((it) => String(it || "").trim())
      .filter(Boolean)
      .map((name, idx) => ({ id: `corp-${idx + 1}`, name, enabled: true }));
  }
  return [];
};

poolRoutes.get("/accounts", requireAuth, async (req, res) => {
  const filters = {
    search: req.query.search,
    tier: req.query.tier,
    is_enabled: toBooleanOrUndefined(req.query.is_enabled),
    is_online: toBooleanOrUndefined(req.query.is_online),
    page: req.query.page,
    pageSize: req.query.pageSize
  };
  const result = await prismaStore.listPoolAccountsPage(filters);
  return res.json({ items: result.items, data: result.items, meta: result.meta });
});

poolRoutes.get("/accounts/:id", requireAuth, async (req, res) => {
  const item = await prismaStore.getPoolAccount(req.params.id);
  if (!item) {
    return res.status(404).json({ message: "Pool account not found" });
  }
  return res.json(item);
});

poolRoutes.get("/corporate-agreements", requireAuth, async (req, res) => {
  const accounts = await prismaStore.listPoolAccounts();
  const names = new Set();
  accounts.forEach((account) => {
    (account.corporate_agreements || []).forEach((corp) => {
      if (corp?.name) {
        names.add(corp.name);
      }
    });
  });

  return res.json({
    items: Array.from(names).map((name) => ({ id: name, name }))
  });
});

poolRoutes.post("/accounts", requireAuth, async (req, res) => {
  const payload = req.body || {};
  const validationError = validateCreatePayload(payload);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }
  try {
    const item = await prismaStore.createPoolAccount(payload);
    return res.status(201).json(item);
  } catch (err) {
    return res.status(400).json({ message: err.message || "failed to create pool account" });
  }
});

poolRoutes.post("/accounts/bulk-import", requireAuth, async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ message: "items is required" });
  }
  if (items.length > 2000) {
    return res.status(400).json({ message: "single import is limited to 2000 items" });
  }

  const results = [];
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i] || {};
    const payload = {
      phone: String(raw.phone || "").trim(),
      token: String(raw.token || "").trim(),
      remark: raw.remark ? String(raw.remark) : null,
      is_enabled: raw.is_enabled !== false,
      is_online: raw.is_online !== false,
      is_new_user: Boolean(raw.is_new_user),
      is_platinum: Boolean(raw.is_platinum),
      dailyOrdersLeft: Math.max(0, Number(raw.dailyOrdersLeft) || 0),
      corporate_agreements: toCorporateAgreements(raw.corporate_agreements)
    };

    const validationError = validateCreatePayload(payload);
    if (validationError) {
      results.push({ index: i, ok: false, message: validationError, phone: payload.phone });
      continue;
    }

    try {
      const created = await prismaStore.createPoolAccount(payload);
      results.push({ index: i, ok: true, id: created.id, phone: created.phone });
    } catch (err) {
      results.push({
        index: i,
        ok: false,
        phone: payload.phone,
        message: err?.message || "failed to create pool account"
      });
    }
  }

  return res.json({
    ok: true,
    total: items.length,
    success: results.filter((it) => it.ok).length,
    failed: results.filter((it) => !it.ok).length,
    results
  });
});

poolRoutes.patch("/accounts/:id", requireAuth, async (req, res) => {
  const payload = { ...(req.body || {}) };
  if (Object.prototype.hasOwnProperty.call(payload, "token") && !String(payload.token || "").trim()) {
    delete payload.token;
  }
  const validationError = validatePatchPayload(payload);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }
  try {
    const item = await prismaStore.updatePoolAccount(req.params.id, payload);
    if (!item) {
      return res.status(404).json({ message: "Pool account not found" });
    }
    return res.json(item);
  } catch (err) {
    return res.status(400).json({ message: err.message || "failed to update pool account" });
  }
});

poolRoutes.delete("/accounts/:id", requireAuth, async (req, res) => {
  const deleted = await prismaStore.deletePoolAccount(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "Pool account not found" });
  }
  return res.status(204).send();
});

const runAccountAction = async ({ action, accountId, proxy }) => {
  if (action === "checkIn") {
    return runDailyCheckinTask({ payload: { accountId }, proxy });
  }
  if (action === "lottery") {
    return runDailyLotteryTask({ payload: { accountId }, proxy });
  }
  if (action === "scan") {
    const couponResult = await runCouponScanTask({ payload: { accountId }, proxy });
    const pointsResult = await runPointsScanTask({ payload: { accountId }, proxy });
    return {
      ok: true,
      couponResult,
      pointsResult
    };
  }
  if (action === "refresh") {
    return runTokenRefreshTask({ payload: { accountId }, proxy });
  }
  throw new Error("unsupported action");
};

poolRoutes.post("/accounts/:id/actions/:action/run", requireAuth, async (req, res) => {
  const account = await prismaStore.getPoolAccount(req.params.id);
  if (!account) {
    return res.status(404).json({ message: "Pool account not found" });
  }
  if (!account.is_enabled) {
    return res.status(400).json({ message: "账号已禁用，不能执行任务" });
  }

  const proxy = await prismaStore.acquireProxyNode();
  if (!proxy) {
    return res.status(400).json({ message: "暂无可用代理节点" });
  }

  try {
    const result = await runAccountAction({ action: req.params.action, accountId: account.id, proxy });
    const latest = await prismaStore.getPoolAccount(account.id);
    return res.json({
      ok: true,
      result,
      account: latest,
      proxyId: proxy.id
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || "执行任务失败" });
  }
});

poolRoutes.post("/actions/:action/run", requireAuth, async (req, res) => {
  const accountIds = Array.isArray(req.body?.accountIds) ? req.body.accountIds.map((it) => String(it)) : [];
  const proxy = await prismaStore.acquireProxyNode();
  if (!proxy) {
    return res.status(400).json({ message: "暂无可用代理节点" });
  }

  const baseFilters = req.params.action === "refresh"
    ? { is_enabled: true }
    : { is_enabled: true, is_online: true };
  let targets = [];
  if (accountIds.length > 0) {
    const uniqueIds = Array.from(new Set(accountIds));
    const items = await Promise.all(uniqueIds.map((id) => prismaStore.getPoolAccount(id)));
    targets = items.filter(Boolean).filter((it) => {
      if (!it.is_enabled) {
        return false;
      }
      if (req.params.action !== "refresh" && !it.is_online) {
        return false;
      }
      return true;
    });
  } else {
    targets = await prismaStore.listPoolAccounts(baseFilters);
  }

  const results = [];
  for (const account of targets) {
    try {
      const result = await runAccountAction({ action: req.params.action, accountId: account.id, proxy });
      results.push({ accountId: account.id, ok: true, result });
    } catch (err) {
      results.push({ accountId: account.id, ok: false, message: err.message || "failed" });
    }
  }

  return res.json({
    ok: true,
    total: targets.length,
    success: results.filter((it) => it.ok).length,
    failed: results.filter((it) => !it.ok).length,
    results,
    proxyId: proxy.id
  });
});
