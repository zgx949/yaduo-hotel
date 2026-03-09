import { Router } from "express";
import { prismaStore } from "../data/prisma-store.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { processOrderTask } from "../services/task-processor.js";
import { taskPlatform } from "../tasks/task-platform.js";
import {
  addAppOrder,
  calculateOrderV2,
  cancelAtourOrder,
  createPayOrder,
  generateOrderItemPaymentLink,
  getCashierInformation,
  runAtourOrderWorkflow
} from "../services/atour-order.service.js";
import { canUserUseBookingTier, parseBookingTier } from "../services/booking-channel.service.js";
import { getInternalRequestContext } from "../services/internal-resource.service.js";
import {
  refreshOrderItemStatusByAtour,
  refreshOrderStatusByAtour
} from "../services/order-status-sync.service.js";

export const ordersRoutes = Router();

const PAYMENT_READY_STATES = new Set(["ORDERED", "DONE"]);

const toPaymentSplitView = (item) => ({
  itemId: item.id,
  splitIndex: item.splitIndex,
  splitTotal: item.splitTotal,
  roomType: item.roomType,
  roomCount: item.roomCount,
  amount: item.amount,
  status: item.status,
  paymentStatus: item.paymentStatus,
  executionStatus: item.executionStatus,
  atourOrderId: item.atourOrderId || null
});

const buildPaymentDecision = (order) => {
  const activeItems = (order.items || []).filter((it) => it.status !== "CANCELLED");
  const unpaidItems = activeItems.filter((it) => it.paymentStatus !== "PAID");
  const readyItems = unpaidItems.filter((it) => PAYMENT_READY_STATES.has(it.executionStatus));
  return {
    required: unpaidItems.length > 0,
    modeOptions: ["PAY_NOW", "PAY_LATER"],
    unpaidCount: unpaidItems.length,
    readyCount: readyItems.length,
    pendingCount: unpaidItems.length - readyItems.length,
    splits: activeItems.map(toPaymentSplitView)
  };
};

const waitForPaymentReady = async (orderId, timeoutMs = 20000, intervalMs = 600) => {
  const startedAt = Date.now();
  let latest = await prismaStore.getOrder(orderId);
  while (latest) {
    const activeItems = latest.items.filter((it) => it.status !== "CANCELLED");
    const unpaidItems = activeItems.filter((it) => it.paymentStatus !== "PAID");
    const allReady = unpaidItems.every((it) => PAYMENT_READY_STATES.has(it.executionStatus));
    if (allReady) {
      return { order: latest, ready: true, timeout: false };
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return { order: latest, ready: false, timeout: true };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    latest = await prismaStore.getOrder(orderId);
  }
  return { order: null, ready: false, timeout: true };
};

const pickTokenContext = async (tier, options = {}) => {
  const bookingChannel = parseBookingTier(tier || undefined);
  const ctx = await getInternalRequestContext({
    tier: bookingChannel.tier,
    corporateName: bookingChannel.corporateName,
    preferredAccountId: options.preferredAccountId,
    minDailyOrdersLeft: options.minDailyOrdersLeft || 0
  });
  if (!ctx.token) {
    throw new Error("No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN.");
  }
  if (!ctx.proxy) {
    throw new Error("No available proxy from proxy pool");
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

const cancelSingleOrderItem = async (orderItem, options = {}) => {
  if (!orderItem || orderItem.status === "CANCELLED") {
    return {
      itemId: orderItem?.id || "",
      splitIndex: orderItem?.splitIndex || 0,
      state: "SKIPPED",
      message: "already cancelled"
    };
  }

  if (env.taskSystemEnabled) {
    try {
      const task = await taskPlatform.enqueueModule(
        "order.cancel",
        {
          orderItemId: orderItem.id,
          reason: options.reason || "OTHER",
          reasonBody: options.reasonBody || ""
        },
        { orderGroupId: orderItem.groupId, orderItemId: orderItem.id }
      );
      return {
        itemId: orderItem.id,
        splitIndex: orderItem.splitIndex,
        state: "QUEUED",
        taskId: task.id
      };
    } catch (err) {
      if (env.nodeEnv !== "production") {
        console.warn("order.cancel enqueue failed, fallback to local mode:", err?.message || err);
      }
    }
  }

  try {
    if (orderItem.atourOrderId) {
      const order = await prismaStore.getOrder(orderItem.groupId);
      if (!order) {
        throw new Error("order not found");
      }

      const tokenCtx = await pickTokenContext(orderItem.bookingTier || undefined, {
        preferredAccountId: orderItem.accountId || undefined,
        minDailyOrdersLeft: 1
      });
      await cancelAtourOrder({
        token: tokenCtx.token,
        proxy: tokenCtx.proxy,
        chainId: order.chainId,
        folioId: orderItem.atourOrderId,
        reason: options.reason || "OTHER",
        reasonBody: options.reasonBody || ""
      });
    }

    const cancelledItem = await prismaStore.cancelOrderItem(orderItem.id);
    return {
      itemId: orderItem.id,
      splitIndex: orderItem.splitIndex,
      state: "CANCELLED",
      item: cancelledItem
    };
  } catch (err) {
    return {
      itemId: orderItem.id,
      splitIndex: orderItem.splitIndex,
      state: "FAILED",
      message: err?.message || "cancel failed"
    };
  }
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

  const systemConfig = await prismaStore.getSystemConfig();
  const previewSplits = Array.isArray(splits) && splits.length > 0
    ? splits
    : [{ bookingTier: req.body?.bookingTier || "NORMAL" }];
  for (const split of previewSplits) {
    const channel = parseBookingTier(split?.bookingTier || "NORMAL");
    const permissionCheck = canUserUseBookingTier({
      user: req.auth.user,
      channel,
      systemChannels: systemConfig.channels
    });
    if (!permissionCheck.ok) {
      return res.status(403).json({ message: permissionCheck.message || "该渠道无权限或配额不足" });
    }
  }

  const order = await prismaStore.createOrder(req.body || {}, req.auth.user);
  const tasks = [];

  for (const item of order.items.filter((it) => it.executionStatus === "QUEUED")) {
    const task = await enqueueOrderItemTask(item);
    tasks.push(task);
  }

  return res.status(201).json({
    order,
    tasks,
    paymentDecision: buildPaymentDecision(order)
  });
});

ordersRoutes.get("/:id/payment-options", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  return res.json({
    orderId: order.id,
    paymentDecision: buildPaymentDecision(order)
  });
});

ordersRoutes.post("/:id/payment/prepare", requireAuth, async (req, res) => {
  // TODO: 发起更新请求
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const waitForReady = req.body?.waitForReady !== false;
  const timeoutMs = Math.max(2000, Number(req.body?.timeoutMs) || 20000);
  const readyState = waitForReady
    ? await waitForPaymentReady(order.id, timeoutMs)
    : { order, ready: false, timeout: false };
  const targetOrder = readyState.order || order;

  const payableItems = targetOrder.items
    .filter((it) => it.status !== "CANCELLED" && it.paymentStatus !== "PAID")
    .sort((a, b) => a.splitIndex - b.splitIndex);

  const paymentSplits = [];
  for (const item of payableItems) {
    if (!PAYMENT_READY_STATES.has(item.executionStatus)) {
      paymentSplits.push({
        ...toPaymentSplitView(item),
        paymentLink: null,
        linkState: "PENDING_ORDER_SUBMIT"
      });
      continue;
    }

    try {
      const payment = await generateOrderItemPaymentLink({ orderItemId: item.id });
      paymentSplits.push({
        ...toPaymentSplitView(item),
        paymentLink: payment.paymentLink,
        paymentOrderNo: payment.paymentOrderNo,
        payOrgMerId: payment.payOrgMerId,
        channelType: payment.channelType,
        payInfo: payment.payInfo,
        linkState: "READY"
      });
    } catch (err) {
      paymentSplits.push({
        ...toPaymentSplitView(item),
        paymentLink: null,
        linkState: "LINK_FAILED",
        error: err?.message || "generate payment link failed"
      });
    }
  }

  return res.json({
    orderId: targetOrder.id,
    ready: readyState.ready,
    timeout: readyState.timeout,
    paymentDecision: buildPaymentDecision(targetOrder),
    paymentSplits
  });
});

ordersRoutes.post("/:id/payment/sync", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const paidItemIds = Array.isArray(req.body?.paidItemIds)
    ? req.body.paidItemIds.map((it) => String(it))
    : [];
  const shouldRefreshExecution = req.body?.refreshExecutionStatus !== false;

  if (shouldRefreshExecution) {
    await refreshOrderStatusByAtour(order);
  }

  for (const item of order.items) {
    if (paidItemIds.includes(item.id)) {
      await prismaStore.updateOrderItem(item.id, { paymentStatus: "PAID" });
    }
  }

  const refreshed = await prismaStore.refreshOrderStatus(order.id);
  return res.json({
    order: refreshed,
    paymentDecision: buildPaymentDecision(refreshed)
  });
});

ordersRoutes.post("/atour/calculate", requireAuth, async (req, res) => {
  try {
    const tokenCtx = await pickTokenContext(req.body?.tier);
    const result = await calculateOrderV2({
      token: tokenCtx.token,
      proxy: tokenCtx.proxy,
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
      proxy: tokenCtx.proxy,
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
      proxy: tokenCtx.proxy,
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
      proxy: tokenCtx.proxy,
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
    // TODO: 自动领门店优惠券，并选择优惠券
    const result = await runAtourOrderWorkflow({
      token: tokenCtx.token,
      proxy: tokenCtx.proxy,
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

  const refreshed = await refreshOrderStatusByAtour(order);
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
  return res.json({
    order: result.order,
    tasks,
    paymentDecision: buildPaymentDecision(result.order)
  });
});

ordersRoutes.post("/:id/cancel", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const targets = order.items.filter((it) => it.status !== "CANCELLED");
  const reason = req.body?.reason || "OTHER";
  const reasonBody = req.body?.reasonBody || "";
  const results = await Promise.all(
    targets.map((item) => cancelSingleOrderItem(item, { reason, reasonBody }))
  );

  const refreshedOrder = await prismaStore.refreshOrderStatus(order.id);
  const summary = {
    total: targets.length,
    queued: results.filter((it) => it.state === "QUEUED").length,
    cancelled: results.filter((it) => it.state === "CANCELLED").length,
    skipped: results.filter((it) => it.state === "SKIPPED").length,
    failed: results.filter((it) => it.state === "FAILED").length
  };

  return res.json({
    order: refreshedOrder,
    summary,
    results
  });
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

  if (!item.atourOrderId) {
    const updated = await prismaStore.refreshOrderItemStatus(req.params.itemId);
    return res.json({ item: updated, source: "local" });
  }

  try {
    const refreshed = await refreshOrderItemStatusByAtour(order, item, { source: "route.refresh-order-item" });
    return res.json({ item: refreshed.item, source: "atour", details: refreshed.details });
  } catch (err) {
    return res.status(400).json({ message: err?.message || "刷新拆单状态失败" });
  }
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

  const result = await cancelSingleOrderItem(item, {
    reason: req.body?.reason || "OTHER",
    reasonBody: req.body?.reasonBody || ""
  });
  await prismaStore.refreshOrderStatus(item.groupId);

  if (result.state === "FAILED") {
    return res.status(400).json({ message: result.message || "cancel item failed" });
  }

  if (result.state === "QUEUED") {
    return res.json({ queued: true, taskId: result.taskId, result });
  }

  return res.json({ queued: false, result });
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
