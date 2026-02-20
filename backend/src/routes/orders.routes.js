import { Router } from "express";
import { prismaStore } from "../data/prisma-store.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { processOrderTask } from "../services/task-processor.js";
import { taskPlatform } from "../tasks/task-platform.js";
import {
  addAppOrder,
  calculateOrderV2,
  createPayOrder,
  generateOrderItemPaymentLink,
  getCashierInformation,
  runAtourOrderWorkflow
} from "../services/atour-order.service.js";
import { getInternalRequestContext } from "../services/internal-resource.service.js";

export const ordersRoutes = Router();

const pickTokenContext = async (tier) => {
  const ctx = await getInternalRequestContext({ tier: tier || undefined });
  if (!ctx.token) {
    throw new Error("No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN.");
  }
  return ctx;
};

const enqueueOrderItemTask = async (orderItem) => {
  if (env.taskSystemEnabled) {
    try {
      return await taskPlatform.enqueueModule(
        "order.submit",
        { orderItemId: orderItem.id },
        { orderGroupId: orderItem.groupId, orderItemId: orderItem.id }
      );
    } catch (err) {
      if (env.nodeEnv !== "production") {
        console.warn("order.submit enqueue failed, fallback to local mode:", err?.message || err);
      }
    }
  }

  const fallbackTask = await prismaStore.createTask(orderItem.id);
  processOrderTask(fallbackTask.id).catch(async (err) => {
    await prismaStore.updateTask(fallbackTask.id, {
      state: "failed",
      error: err.message || "Task failed"
    });
    await prismaStore.updateOrderItem(orderItem.id, {
      status: "FAILED",
      executionStatus: "FAILED"
    });
    await prismaStore.refreshOrderStatus(orderItem.groupId);
  });
  return fallbackTask;
};

ordersRoutes.get("/", requireAuth, async (req, res) => {
  const filters = {
    search: req.query.search,
    status: req.query.status,
    creatorId: req.auth.user.role === "ADMIN" ? undefined : req.auth.user.id
  };
  const items = await prismaStore.listOrders(filters);
  return res.json({ items });
});

ordersRoutes.post("/", requireAuth, async (req, res) => {
  const {
    hotelName,
    customerName,
    chainId,
    checkInDate,
    checkOutDate,
    splits
  } = req.body || {};

  if (!hotelName || !customerName || !chainId || !checkInDate || !checkOutDate) {
    return res.status(400).json({ message: "hotelName, customerName, chainId, checkInDate, checkOutDate are required" });
  }

  if (Array.isArray(splits) && splits.length === 0) {
    return res.status(400).json({ message: "splits should not be empty when provided" });
  }

  if (Array.isArray(splits) && splits.length > 0) {
    const missingRateIdentity = splits.find((it) => !it?.rpActivityId && !it?.rateCodeId);
    if (missingRateIdentity) {
      return res.status(400).json({ message: "Each split must include rpActivityId or rateCodeId" });
    }
  }

  const order = await prismaStore.createOrder(req.body || {}, req.auth.user);
  const tasks = [];

  for (const item of order.items.filter((it) => it.executionStatus === "QUEUED")) {
    const task = await enqueueOrderItemTask(item);
    tasks.push(task);
  }

  return res.status(201).json({ order, tasks });
});

ordersRoutes.post("/atour/calculate", requireAuth, async (req, res) => {
  try {
    const tokenCtx = await pickTokenContext(req.body?.tier);
    const result = await calculateOrderV2({
      token: tokenCtx.token,
      payload: req.body?.payload || {}
    });
    return res.json({
      result,
      tokenSource: tokenCtx.tokenSource,
      tokenAccountId: tokenCtx.tokenAccountId,
      proxyId: tokenCtx.proxy?.id || null
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || "calculate order failed" });
  }
});

ordersRoutes.post("/atour/create", requireAuth, async (req, res) => {
  try {
    const tokenCtx = await pickTokenContext(req.body?.tier);
    const result = await addAppOrder({
      token: tokenCtx.token,
      payload: req.body?.payload || {}
    });
    return res.json({
      result,
      tokenSource: tokenCtx.tokenSource,
      tokenAccountId: tokenCtx.tokenAccountId,
      proxyId: tokenCtx.proxy?.id || null
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || "create order failed" });
  }
});

ordersRoutes.post("/atour/pay-order", requireAuth, async (req, res) => {
  try {
    const tokenCtx = await pickTokenContext(req.body?.tier);
    const result = await createPayOrder({
      token: tokenCtx.token,
      payload: req.body?.payload || {}
    });
    return res.json({
      result,
      tokenSource: tokenCtx.tokenSource,
      tokenAccountId: tokenCtx.tokenAccountId,
      proxyId: tokenCtx.proxy?.id || null
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || "create pay order failed" });
  }
});

ordersRoutes.post("/atour/pay-methods", requireAuth, async (req, res) => {
  try {
    const tokenCtx = await pickTokenContext(req.body?.tier);
    const result = await getCashierInformation({
      token: tokenCtx.token,
      payload: req.body?.payload || {}
    });
    return res.json({
      result,
      tokenSource: tokenCtx.tokenSource,
      tokenAccountId: tokenCtx.tokenAccountId,
      proxyId: tokenCtx.proxy?.id || null
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || "get pay methods failed" });
  }
});

ordersRoutes.post("/atour/workflow", requireAuth, async (req, res) => {
  try {
    const tokenCtx = await pickTokenContext(req.body?.tier);
    const result = await runAtourOrderWorkflow({
      token: tokenCtx.token,
      calculatePayload: req.body?.calculatePayload || {}
    });
    return res.json({
      result,
      tokenSource: tokenCtx.tokenSource,
      tokenAccountId: tokenCtx.tokenAccountId,
      proxyId: tokenCtx.proxy?.id || null
    });
  } catch (err) {
    return res.status(400).json({ message: err.message || "run order workflow failed" });
  }
});

ordersRoutes.patch("/:id", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const updated = await prismaStore.updateOrder(req.params.id, req.body || {});
  return res.json(updated);
});

ordersRoutes.post("/:id/refresh-status", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  for (const item of order.items) {
    await prismaStore.refreshOrderItemStatus(item.id);
  }

  const refreshed = await prismaStore.refreshOrderStatus(order.id);
  return res.json(refreshed);
});

ordersRoutes.post("/:id/submit", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const result = await prismaStore.submitOrder(order.id);
  const tasks = [];
  for (const item of result.items.filter((it) => it.executionStatus === "QUEUED")) {
    const existingTask = await prismaStore.findTaskByOrderItem(item.id);
    if (existingTask && ["waiting", "active"].includes(existingTask.state)) {
      continue;
    }
    tasks.push(await enqueueOrderItemTask(item));
  }
  return res.json({ order: result.order, tasks });
});

ordersRoutes.post("/:id/cancel", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (env.taskSystemEnabled) {
    try {
      const tasks = [];
      for (const item of order.items.filter((it) => it.status !== "CANCELLED")) {
        tasks.push(
          await taskPlatform.enqueueModule(
            "order.cancel",
            { orderItemId: item.id },
            { orderGroupId: order.id, orderItemId: item.id }
          )
        );
      }
      return res.json({ queued: true, tasks });
    } catch (err) {
      if (env.nodeEnv !== "production") {
        console.warn("order.cancel enqueue failed, fallback to local mode:", err?.message || err);
      }
    }
  }

  const cancelled = await prismaStore.cancelOrder(order.id);
  return res.json(cancelled);
});

ordersRoutes.patch("/items/:itemId", requireAuth, async (req, res) => {
  const item = await prismaStore.getOrderItemById(req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }
  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const updated = await prismaStore.updateOrderItem(req.params.itemId, req.body || {});
  await prismaStore.refreshOrderStatus(updated.groupId);
  return res.json(updated);
});

ordersRoutes.post("/items/:itemId/refresh-status", requireAuth, async (req, res) => {
  const item = await prismaStore.getOrderItemById(req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }
  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const updated = await prismaStore.refreshOrderItemStatus(req.params.itemId);
  return res.json(updated);
});

ordersRoutes.post("/items/:itemId/confirm-submit", requireAuth, async (req, res) => {
  const item = await prismaStore.getOrderItemById(req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }
  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (!["PLAN_PENDING", "FAILED"].includes(item.executionStatus)) {
    return res.json({ item, task: null });
  }

  const submitted = await prismaStore.submitOrderItem(item.id);
  const existingTask = await prismaStore.findTaskByOrderItem(item.id);
  let task = existingTask;
  if (!existingTask || !["waiting", "active"].includes(existingTask.state)) {
    task = await enqueueOrderItemTask(submitted);
  }
  await prismaStore.refreshOrderStatus(item.groupId);
  return res.json({ item: submitted, task });
});

ordersRoutes.post("/items/:itemId/cancel", requireAuth, async (req, res) => {
  const item = await prismaStore.getOrderItemById(req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }
  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  if (env.taskSystemEnabled) {
    try {
      const task = await taskPlatform.enqueueModule(
        "order.cancel",
        { orderItemId: item.id },
        { orderGroupId: item.groupId, orderItemId: item.id }
      );
      return res.json({ queued: true, task });
    } catch (err) {
      if (env.nodeEnv !== "production") {
        console.warn("order.cancel(item) enqueue failed, fallback to local mode:", err?.message || err);
      }
    }
  }

  const cancelled = await prismaStore.cancelOrderItem(item.id);
  await prismaStore.refreshOrderStatus(item.groupId);
  return res.json(cancelled);
});

ordersRoutes.get("/items/:itemId/payment-link", requireAuth, async (req, res) => {
  const item = await prismaStore.getOrderItemById(req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }
  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const links = await prismaStore.getOrderItemLinks(req.params.itemId);
  if (item.executionStatus !== "ORDERED" && item.executionStatus !== "DONE") {
    return res.json({ paymentLink: links.paymentLink });
  }

  try {
    const payment = await generateOrderItemPaymentLink({ orderItemId: req.params.itemId });
    return res.json({
      paymentLink: payment.paymentLink,
      paymentOrderNo: payment.paymentOrderNo,
      payOrgMerId: payment.payOrgMerId,
      channelType: payment.channelType,
      payInfo: payment.payInfo
    });
  } catch (err) {
    if (env.nodeEnv !== "production") {
      console.warn("generate payment link failed, fallback to stored link:", err?.message || err);
    }
    const paymentOrderNo = item.atourOrderId || item.id;
    const page = `pages/cashier/cashier?p=${paymentOrderNo}&s=app`;
    const fallbackLink = `alipays://platformapi/startapp?appId=2021003121605466&thirdPartSchema=${encodeURIComponent("atourlifeALiPay://")}&page=${encodeURIComponent(page)}&bank_switch=Y`;
    return res.json({
      paymentLink: fallbackLink,
      paymentOrderNo,
      payOrgMerId: ""
    });
  }
});

ordersRoutes.get("/items/:itemId/detail-link", requireAuth, async (req, res) => {
  const item = await prismaStore.getOrderItemById(req.params.itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found" });
  }
  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const links = await prismaStore.getOrderItemLinks(req.params.itemId);
  return res.json({ detailUrl: links.detailUrl });
});
