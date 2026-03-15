import { Router } from "express";
import { otaPrismaStore } from "../data/ota-prisma-store.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { otaIntegrationService } from "../services/ota-integration.service.js";

const normalizePlatform = (value) => String(value || "FLIGGY").trim().toUpperCase() || "FLIGGY";

const buildErrorPayload = (err, fallbackCode = "BAD_REQUEST", fallbackMessage = "request failed") => {
  const payload = {
    code: err?.code || fallbackCode,
    message: err?.message || fallbackMessage
  };
  if (err?.level !== undefined) {
    payload.level = err.level;
  }
  if (err?.field !== undefined) {
    payload.field = err.field;
  }
  if (err?.details !== undefined) {
    payload.details = err.details;
  }
  return payload;
};

const respondServiceError = (res, err, fallbackMessage) => {
  if (err?.code === "OTA_PUBLISH_VALIDATION_ERROR") {
    return res.status(400).json(buildErrorPayload(err, "OTA_PUBLISH_VALIDATION_ERROR", fallbackMessage));
  }

  const errCode = String(err?.code || "").trim().toUpperCase();
  const knownInputError =
    Number(err?.statusCode) === 400
    || err?.name === "ValidationError"
    || errCode.includes("VALIDATION")
    || errCode.includes("BAD_REQUEST")
    || errCode.includes("INVALID")
    || errCode.includes("REQUIRED")
    || errCode.includes("UNSUPPORTED");

  if (knownInputError) {
    return res.status(400).json(buildErrorPayload(err, "BAD_REQUEST", fallbackMessage));
  }

  return res.status(500).json({
    code: "INTERNAL_ERROR",
    message: err?.message || fallbackMessage || "internal server error"
  });
};

export const otaProductCenterRoutes = Router();

otaProductCenterRoutes.use(requireAuth, requireRole("ADMIN"));

otaProductCenterRoutes.get("/tree", async (req, res) => {
  try {
    const platform = normalizePlatform(req.query?.platform);
    const items = await otaPrismaStore.getProductCenterTree({ platform });
    return res.status(200).json({ items });
  } catch (err) {
    return respondServiceError(res, err, "get product center tree failed");
  }
});

otaProductCenterRoutes.post("/import-atour", async (req, res) => {
  try {
    const result = await otaIntegrationService.importAtourHotel({
      platform: req.body?.platform,
      atour: req.body?.atour
    });
    return res.status(201).json(result);
  } catch (err) {
    return respondServiceError(res, err, "import atour hotel failed");
  }
});

otaProductCenterRoutes.post("/mappings/hotel-shid", async (req, res) => {
  try {
    const mapping = await otaIntegrationService.upsertHotelMapping(req.body || {});
    return res.status(201).json(mapping);
  } catch (err) {
    return respondServiceError(res, err, "upsert hotel mapping failed");
  }
});

otaProductCenterRoutes.post("/mappings/room-srid", async (req, res) => {
  try {
    const mapping = await otaIntegrationService.upsertRoomMapping(req.body || {});
    return res.status(201).json(mapping);
  } catch (err) {
    return respondServiceError(res, err, "upsert room mapping failed");
  }
});

otaProductCenterRoutes.post("/strategies/save-and-publish", async (req, res) => {
  try {
    const result = await otaIntegrationService.saveStrategyAndAutoPublish({
      platform: req.body?.platform,
      strategy: req.body?.strategy,
      publishProduct: req.body?.publishProduct
    });
    return res.status(201).json({
      platform: result.platform,
      strategy: result.strategy,
      publish: result.publish
    });
  } catch (err) {
    return respondServiceError(res, err, "save strategy and publish failed");
  }
});

otaProductCenterRoutes.post("/publish/retry", async (req, res) => {
  try {
    const result = await otaIntegrationService.saveStrategyAndAutoPublish({
      platform: req.body?.platform,
      strategy: req.body?.strategy,
      publishProduct: req.body?.publishProduct
    });
    return res.status(201).json({
      platform: result.platform,
      strategy: result.strategy,
      publish: result.publish
    });
  } catch (err) {
    return respondServiceError(res, err, "retry publish failed");
  }
});
