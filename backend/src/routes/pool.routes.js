import { Router } from "express";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";

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

poolRoutes.get("/accounts", requireAuth, (req, res) => {
  const filters = {
    search: req.query.search,
    tier: req.query.tier,
    is_online: toBooleanOrUndefined(req.query.is_online)
  };
  return res.json({ items: store.listPoolAccounts(filters) });
});

poolRoutes.get("/accounts/:id", requireAuth, (req, res) => {
  const item = store.getPoolAccount(req.params.id);
  if (!item) {
    return res.status(404).json({ message: "Pool account not found" });
  }
  return res.json(item);
});

poolRoutes.get("/corporate-agreements", requireAuth, (req, res) => {
  const accounts = store.listPoolAccounts();
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

poolRoutes.post("/accounts", requireAuth, (req, res) => {
  const payload = req.body || {};
  const validationError = validateCreatePayload(payload);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }
  if (store.isPoolTokenTaken(payload.token)) {
    return res.status(409).json({ message: "token already exists" });
  }
  try {
    const item = store.createPoolAccount(payload);
    return res.status(201).json(item);
  } catch (err) {
    return res.status(400).json({ message: err.message || "failed to create pool account" });
  }
});

poolRoutes.patch("/accounts/:id", requireAuth, (req, res) => {
  const payload = { ...(req.body || {}) };
  if (Object.prototype.hasOwnProperty.call(payload, "token") && !String(payload.token || "").trim()) {
    delete payload.token;
  }
  const validationError = validatePatchPayload(payload);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }
  if (payload.token && store.isPoolTokenTaken(payload.token, req.params.id)) {
    return res.status(409).json({ message: "token already exists" });
  }

  try {
    const item = store.updatePoolAccount(req.params.id, payload);
    if (!item) {
      return res.status(404).json({ message: "Pool account not found" });
    }
    return res.json(item);
  } catch (err) {
    return res.status(400).json({ message: err.message || "failed to update pool account" });
  }
});

poolRoutes.delete("/accounts/:id", requireAuth, (req, res) => {
  const deleted = store.deletePoolAccount(req.params.id);
  if (!deleted) {
    return res.status(404).json({ message: "Pool account not found" });
  }
  return res.status(204).send();
});
