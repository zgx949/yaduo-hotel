import { Router } from "express";
import { prismaStore } from "../data/prisma-store.js";
import { requireAuth } from "../middleware/auth.js";

export const blacklistRoutes = Router();

const VALID_SEVERITY = new Set(["HIGH", "MEDIUM", "LOW"]);
const VALID_STATUS = new Set(["ACTIVE", "RESOLVED"]);

const normalizeTags = (tags) => {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags;
  }
  return String(tags)
    .split(",")
    .map((it) => it.trim())
    .filter(Boolean);
};

const validateCreatePayload = (payload) => {
  if (!payload.chainId) {
    return "chainId is required";
  }
  if (!payload.hotelName) {
    return "hotelName is required";
  }
  if (!payload.reason) {
    return "reason is required";
  }
  if (!payload.severity || !VALID_SEVERITY.has(payload.severity)) {
    return "severity must be HIGH, MEDIUM or LOW";
  }
  return null;
};

const validatePatchPayload = (payload) => {
  if (Object.keys(payload).length === 0) {
    return "patch body cannot be empty";
  }
  if (payload.severity && !VALID_SEVERITY.has(payload.severity)) {
    return "severity must be HIGH, MEDIUM or LOW";
  }
  if (payload.status && !VALID_STATUS.has(payload.status)) {
    return "status must be ACTIVE or RESOLVED";
  }
  return null;
};

blacklistRoutes.get("/records", requireAuth, async (req, res) => {
  const items = await prismaStore.listBlacklistRecords({
    search: req.query.search,
    chainId: req.query.chainId,
    severity: req.query.severity,
    status: req.query.status
  });
  return res.json({ items });
});

blacklistRoutes.get("/records/:id", requireAuth, async (req, res) => {
  const item = await prismaStore.getBlacklistRecord(req.params.id);
  if (!item) {
    return res.status(404).json({ message: "Blacklist record not found" });
  }
  return res.json(item);
});

blacklistRoutes.post("/records", requireAuth, async (req, res) => {
  const payload = { ...req.body, tags: normalizeTags(req.body?.tags) };
  const err = validateCreatePayload(payload);
  if (err) {
    return res.status(400).json({ message: err });
  }

  const item = await prismaStore.createBlacklistRecord(payload, req.auth.user);
  return res.status(201).json(item);
});

blacklistRoutes.patch("/records/:id", requireAuth, async (req, res) => {
  const payload = { ...req.body };
  if (payload.tags !== undefined) {
    payload.tags = normalizeTags(payload.tags);
  }

  const err = validatePatchPayload(payload);
  if (err) {
    return res.status(400).json({ message: err });
  }

  const item = await prismaStore.updateBlacklistRecord(req.params.id, payload);
  if (!item) {
    return res.status(404).json({ message: "Blacklist record not found" });
  }
  return res.json(item);
});

blacklistRoutes.delete("/records/:id", requireAuth, async (req, res) => {
  const ok = await prismaStore.deleteBlacklistRecord(req.params.id);
  if (!ok) {
    return res.status(404).json({ message: "Blacklist record not found" });
  }
  return res.status(204).send();
});

blacklistRoutes.get("/hotels", requireAuth, async (req, res) => {
  const items = await prismaStore.listBlacklistHotels({
    search: req.query.search,
    chainId: req.query.chainId,
    severity: req.query.severity,
    status: req.query.status
  });
  return res.json({ items });
});

blacklistRoutes.get("/hotel-check", requireAuth, async (req, res) => {
  const { chainId, hotelName } = req.query;
  if (!chainId && !hotelName) {
    return res.status(400).json({ message: "chainId or hotelName is required" });
  }

  const result = await prismaStore.checkBlacklistedHotel(chainId, hotelName);
  return res.json(result);
});
