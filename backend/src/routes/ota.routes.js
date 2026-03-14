import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { otaIntegrationService } from "../services/ota-integration.service.js";
import { taskPlatform } from "../tasks/task-platform.js";
import { env } from "../config/env.js";

export const otaRoutes = Router();

otaRoutes.get("/platforms", requireAuth, async (req, res) => {
  return res.json({ items: otaIntegrationService.listPlatforms() });
});

otaRoutes.post("/hotels/sync", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.syncPublishedHotels({
      platform: req.body?.platform || req.query?.platform || "FLIGGY"
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "sync ota hotels failed" });
  }
});

otaRoutes.get("/hotels", requireAuth, async (req, res) => {
  const items = await otaIntegrationService.listPublishedHotels({ platform: req.query.platform });
  return res.json({ items });
});

otaRoutes.post("/products/hotels", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.upsertHotelProduct({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      product: req.body?.product || req.body || {}
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "upsert hotel product failed" });
  }
});

otaRoutes.delete("/products/hotels/:platformHotelId", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.deleteHotelProduct({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      product: {
        ...(req.body?.product || req.body || {}),
        platformHotelId: req.params.platformHotelId
      }
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "delete local hotel product failed" });
  }
});

otaRoutes.post("/products/room-types", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.upsertRoomTypeProduct({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      product: req.body?.product || req.body || {}
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "upsert room type product failed" });
  }
});

otaRoutes.delete("/products/room-types/:platformRoomTypeId", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.deleteRoomTypeProduct({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      product: {
        ...(req.body?.product || req.body || {}),
        platformRoomTypeId: req.params.platformRoomTypeId,
        platformHotelId: req.body?.platformHotelId || req.query?.platformHotelId || req.body?.product?.platformHotelId
      }
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "delete room type product failed" });
  }
});

otaRoutes.post("/products/rateplans", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.upsertRatePlanProduct({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      product: req.body?.product || req.body || {}
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "upsert rateplan product failed" });
  }
});

otaRoutes.delete("/products/rateplans", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.deleteRatePlanProduct({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      product: req.body?.product || req.body || {}
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "delete rateplan product failed" });
  }
});

otaRoutes.delete("/products/rates", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.deleteRateProduct({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      product: req.body?.product || req.body || {}
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "delete rate product failed" });
  }
});

otaRoutes.post("/mappings/hotels", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const mapping = await otaIntegrationService.upsertHotelMapping(req.body || {});
    return res.status(201).json(mapping);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "upsert hotel mapping failed" });
  }
});

otaRoutes.get("/mappings/hotels", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await otaIntegrationService.listHotelMappings({ platform: req.query.platform });
  return res.json({ items });
});

otaRoutes.post("/mappings/rooms", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const mapping = await otaIntegrationService.upsertRoomMapping(req.body || {});
    return res.status(201).json(mapping);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "upsert room mapping failed" });
  }
});

otaRoutes.get("/mappings/rooms", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await otaIntegrationService.listRoomMappings({ platform: req.query.platform });
  return res.json({ items });
});

otaRoutes.post("/mappings/channels", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const mapping = await otaIntegrationService.upsertChannelMapping(req.body || {});
    return res.status(201).json(mapping);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "upsert channel mapping failed" });
  }
});

otaRoutes.get("/mappings/channels", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await otaIntegrationService.listChannelMappings({ platform: req.query.platform });
  return res.json({ items });
});

otaRoutes.post("/calendar", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const items = await otaIntegrationService.setCalendarItems({
      platform: req.body?.platform || "FLIGGY",
      items: req.body?.items || [],
      source: "api"
    });
    return res.status(201).json({ count: items.length, items });
  } catch (err) {
    return res.status(400).json({ message: err?.message || "set calendar items failed" });
  }
});

otaRoutes.get("/calendar", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await otaIntegrationService.listCalendarItems({
    platform: req.query.platform,
    platformHotelId: req.query.platformHotelId,
    platformRoomTypeId: req.query.platformRoomTypeId,
    platformChannel: req.query.platformChannel,
    rateplanCode: req.query.rateplanCode,
    startDate: req.query.startDate,
    endDate: req.query.endDate
  });
  return res.json({ items });
});

otaRoutes.post("/calendar/sync-from-rack", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const clearRaw = req.body?.clearOutOfRange ?? req.query?.clearOutOfRange;
    const clearOutOfRange =
      clearRaw === true
      || String(clearRaw || "").toLowerCase() === "true"
      || String(clearRaw || "") === "1";
    const result = await otaIntegrationService.syncCalendarFromRackRates({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      date: req.body?.date || req.query?.date,
      days: req.body?.days || req.query?.days,
      platformHotelId: req.body?.platformHotelId || req.query?.platformHotelId,
      platformRoomTypeId: req.body?.platformRoomTypeId || req.query?.platformRoomTypeId,
      platformChannel: req.body?.platformChannel || req.query?.platformChannel,
      rateplanCode: req.body?.rateplanCode || req.query?.rateplanCode,
      clearOutOfRange
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "sync rack rates failed" });
  }
});

otaRoutes.post("/calendar/preview-rack", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.previewRackRateForStrategy({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      date: req.body?.date || req.query?.date,
      platformHotelId: req.body?.platformHotelId || req.query?.platformHotelId,
      platformRoomTypeId: req.body?.platformRoomTypeId || req.query?.platformRoomTypeId,
      platformChannel: req.body?.platformChannel || req.query?.platformChannel,
      rateplanCode: req.body?.rateplanCode || req.query?.rateplanCode
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "preview rack price failed" });
  }
});

otaRoutes.post("/push/rate-inventory", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.pushRateInventory({
      platform: req.body?.platform || "FLIGGY",
      items: req.body?.items || []
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "push rate inventory failed" });
  }
});

otaRoutes.post("/webhooks/:platform/orders", async (req, res) => {
  if (!env.otaWebhookSecret) {
    return res.status(503).json({ message: "OTA_WEBHOOK_SECRET is not configured" });
  }
  const rawBody = String(req.rawBody || "");
  const signature = String(req.headers["x-ota-signature"] || "");
  try {
    const result = await otaIntegrationService.ingestOrderWebhook({
      platform: req.params.platform,
      signature,
      rawBody,
      payload: req.body || {}
    });

    let autoSubmitTask = null;
    if (result.autoSubmit && !result.hasLocalOrder && env.taskSystemEnabled) {
      try {
        autoSubmitTask = await taskPlatform.enqueueModule(
          "ota.order-auto-submit",
          {
            platform: result.platform,
            externalOrderId: result.externalOrderId,
            executeNow: true
          },
          { source: "ota-webhook", externalOrderId: result.externalOrderId },
          { jobId: `ota.order-auto-submit:${result.platform}:${result.externalOrderId}` }
        );
      } catch {
        autoSubmitTask = null;
      }
    }

    return res.status(202).json({
      ...result,
      autoSubmitTask
    });
  } catch (err) {
    return res.status(400).json({ message: err?.message || "ingest webhook failed" });
  }
});

otaRoutes.get("/orders/inbound", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await otaIntegrationService.listInboundOrders({
    platform: req.query.platform,
    status: req.query.status
  });
  return res.json({ items });
});

otaRoutes.post("/orders/pull", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const pulled = await otaIntegrationService.pullInboundOrders({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      count: req.body?.count,
      createdStart: req.body?.createdStart || req.query?.createdStart,
      createdEnd: req.body?.createdEnd || req.query?.createdEnd,
      checkInDateStart: req.body?.checkInDateStart || req.query?.checkInDateStart,
      checkInDateEnd: req.body?.checkInDateEnd || req.query?.checkInDateEnd,
      checkOutDateStart: req.body?.checkOutDateStart || req.query?.checkOutDateStart,
      checkOutDateEnd: req.body?.checkOutDateEnd || req.query?.checkOutDateEnd,
      tradeStatus: req.body?.tradeStatus || req.query?.tradeStatus,
      pageNo: req.body?.pageNo || req.query?.pageNo
    });

    const autoSubmitTasks = [];
    const autoSubmitTaskErrors = [];
    if (env.taskSystemEnabled) {
      for (const item of pulled.items || []) {
        if (!item.autoSubmit || item.hasLocalOrder || item.alreadyExists) {
          continue;
        }
        try {
          const task = await taskPlatform.enqueueModule(
            "ota.order-auto-submit",
            {
              platform: item.platform,
              externalOrderId: item.externalOrderId,
              executeNow: true
            },
            { source: "ota-order-pull", externalOrderId: item.externalOrderId },
            { jobId: `ota.order-auto-submit:${item.platform}:${item.externalOrderId}` }
          );
          autoSubmitTasks.push(task);
        } catch (err) {
          autoSubmitTaskErrors.push({
            externalOrderId: item.externalOrderId,
            message: err?.message || "enqueue failed"
          });
        }
      }
    }

    return res.status(201).json({
      ...pulled,
      autoSubmitTaskCount: autoSubmitTasks.length,
      autoSubmitTasks,
      autoSubmitTaskErrors
    });
  } catch (err) {
    return res.status(400).json({ message: err?.message || "pull ota orders failed" });
  }
});

otaRoutes.get("/orders/bindings", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const items = await otaIntegrationService.listOrderBindings({ platform: req.query.platform });
  return res.json({ items });
});

otaRoutes.post("/orders/:externalOrderId/template", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.generateOrderTemplate({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      externalOrderId: req.params.externalOrderId
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "generate template failed" });
  }
});

otaRoutes.post("/orders/:externalOrderId/auto-submit", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.createInternalOrderFromTemplate({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      externalOrderId: req.params.externalOrderId,
      executeNow: req.body?.executeNow === true
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "create internal order failed" });
  }
});

otaRoutes.post("/orders/:externalOrderId/manual-payment-confirm", requireAuth, requireRole("ADMIN"), async (req, res) => {
  try {
    const result = await otaIntegrationService.markManualPaymentAndAcknowledge({
      platform: req.body?.platform || req.query?.platform || "FLIGGY",
      externalOrderId: req.params.externalOrderId,
      localOrderId: req.body?.localOrderId
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ message: err?.message || "manual payment confirmation failed" });
  }
});

otaRoutes.get("/sync-logs", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const items = await otaIntegrationService.listSyncLogs(limit);
  return res.json({ items });
});
