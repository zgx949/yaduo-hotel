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
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const toDateOnly = (value) => new Date(value).toISOString().slice(0, 10);

const dayOffset = (dateText, offsetDays) => {
  const ms = new Date(String(dateText)).getTime() + offsetDays * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
};

const calcNights = (checkInDate, checkOutDate) => {
  const startMs = new Date(String(checkInDate)).getTime();
  const endMs = new Date(String(checkOutDate)).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 1;
  }
  return Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
};

const splitAmountByNights = (amount, nights) => {
  const total = Number(amount) || 0;
  if (nights <= 1) {
    return [Math.round(total * 100) / 100];
  }
  const per = Math.floor((total / nights) * 100) / 100;
  const list = Array.from({ length: nights }, () => per);
  const used = per * (nights - 1);
  list[nights - 1] = Math.round((total - used) * 100) / 100;
  return list;
};

const couponNeedFromItem = (item = {}) => ({
  breakfast: Math.max(0, Number(item.breakfastCount) || 0),
  upgrade: Math.max(0, Number(item.roomLevelUpCount) || 0),
  lateCheckout: Math.max(0, Number(item.delayedCheckOutCount) || 0),
  slippers: Math.max(0, Number(item.shooseCount) || 0)
});

const normalizeSplitBenefits = (splits = []) => {
  const list = Array.isArray(splits) ? splits : [];
  const hasUpgradeRequest = list.some((it) => (Number(it?.roomLevelUpCount) || 0) > 0);

  return list.map((it, idx) => ({
    ...it,
    breakfastCount: Math.max(0, Number(it?.breakfastCount) || 0),
    delayedCheckOutCount: Math.max(0, Number(it?.delayedCheckOutCount) || 0),
    shooseCount: Math.max(0, Number(it?.shooseCount) || 0),
    roomLevelUpCount: hasUpgradeRequest ? 1 : 0
  }));
};

const hasCouponCapacity = (account = {}, need = {}) => {
  return (
    (Number(account.breakfast_coupons) || 0) >= (Number(need.breakfast) || 0) &&
    (Number(account.room_upgrade_coupons) || 0) >= (Number(need.upgrade) || 0) &&
    (Number(account.late_checkout_coupons) || 0) >= (Number(need.lateCheckout) || 0) &&
    (Number(account.coupons?.slippers) || 0) >= (Number(need.slippers) || 0)
  );
};

const isSilverVipGrade = (vipGrade) => {
  const text = String(vipGrade || "").trim();
  if (!text) {
    return false;
  }
  return text.includes("银会员") || text.includes("识君") || text.toUpperCase().includes("SILVER");
};

const isSilverRequiredNewUserRate = (item = {}, payload = {}) => {
  const tier = parseBookingTier(item?.bookingTier || payload?.bookingTier || "NORMAL");
  if (tier.tier !== "NEW_USER") {
    return false;
  }
  const rateCode = String(item?.rateCode || payload?.rateCode || "").trim().toUpperCase();
  return rateCode === "PREPAIDSILV";
};

const expandNewUserSplitsByNight = (payload = {}) => {
  const baseCheckIn = toDateOnly(payload.checkInDate);
  const baseCheckOut = toDateOnly(payload.checkOutDate);
  const sourceSplits = Array.isArray(payload.splits) && payload.splits.length > 0
    ? payload.splits
    : [payload];

  const expanded = [];
  for (const split of sourceSplits) {
    const tier = parseBookingTier(split?.bookingTier || payload?.bookingTier || "NORMAL");
    const splitCheckIn = split?.checkInDate ? toDateOnly(split.checkInDate) : baseCheckIn;
    const splitCheckOut = split?.checkOutDate ? toDateOnly(split.checkOutDate) : baseCheckOut;
    const nights = calcNights(splitCheckIn, splitCheckOut);

    if (tier.tier !== "NEW_USER" || nights <= 1) {
      expanded.push({
        ...split,
        checkInDate: splitCheckIn,
        checkOutDate: splitCheckOut
      });
      continue;
    }

    const amountList = splitAmountByNights(split.amount, nights);
    for (let i = 0; i < nights; i += 1) {
      expanded.push({
        ...split,
        checkInDate: dayOffset(splitCheckIn, i),
        checkOutDate: dayOffset(splitCheckIn, i + 1),
        roomCount: 1,
        amount: amountList[i]
      });
    }
  }

  return {
    ...payload,
    checkInDate: baseCheckIn,
    checkOutDate: baseCheckOut,
    splits: normalizeSplitBenefits(expanded)
  };
};

const reserveNewUserAccounts = async (payload = {}) => {
  const splitList = Array.isArray(payload.splits) ? payload.splits : [];
  const targetItems = splitList.filter((it) => parseBookingTier(it?.bookingTier || payload.bookingTier || "NORMAL").tier === "NEW_USER");
  if (targetItems.length === 0) {
    return payload;
  }

  const credentials = await prismaStore.listPoolAccountCredentials({
    is_enabled: true,
    is_online: true,
    tier: "NEW_USER",
    minDailyOrdersLeft: 1,
    candidateLimit: Math.max(50, Math.min(2000, targetItems.length * 12))
  });
  const candidates = credentials
    .filter((it) => it?.token && it?.account?.is_new_user && (Number(it?.account?.dailyOrdersLeft) || 0) >= 1)
    .sort((a, b) => (Number(b.account.dailyOrdersLeft) || 0) - (Number(a.account.dailyOrdersLeft) || 0));

  const used = new Set();
  const selected = [];
  for (const item of targetItems) {
    const nights = Math.max(1, calcNights(item.checkInDate, item.checkOutDate));
    const need = couponNeedFromItem(item);
    const needSilver = isSilverRequiredNewUserRate(item, payload);
    const selectable = candidates.filter((it) =>
      !used.has(it.account.id) &&
      (Number(it.account.dailyOrdersLeft) || 0) >= nights &&
      hasCouponCapacity(it.account, need) &&
      (!needSilver || isSilverVipGrade(it.account.vip_grade))
    );
    const nonSilver = selectable.filter((it) => !isSilverVipGrade(it.account.vip_grade));
    const picked = needSilver
      ? (selectable[0] || null)
      : ((nonSilver[0] || selectable[0]) || null);
    if (!picked) {
      throw new Error(needSilver
        ? "新客账号不足：该房型要求银会员新客号（PREPAIDSILV），当前无可用银卡新客账号"
        : "新客账号不足：存在间夜券库存不满足（早餐/升房/延迟/拖鞋）或间夜余额不足");
    }
    used.add(picked.account.id);
    selected.push(picked);
  }

  const check = await prismaStore.checkPoolAccountsAvailability(selected.map((it) => String(it.account.id)));
  if (!check.ok) {
    throw new Error(`新客账号不足：需要 ${check.total} 个可用账号，当前仅 ${check.available} 个`);
  }

  let cursor = 0;
  const nextSplits = splitList.map((it) => {
    const tier = parseBookingTier(it?.bookingTier || payload.bookingTier || "NORMAL");
    if (tier.tier !== "NEW_USER") {
      return it;
    }
    const picked = selected[cursor];
    cursor += 1;
    return {
      ...it,
      accountId: picked.account.id,
      accountPhone: picked.account.phone
    };
  });

  return {
    ...payload,
    splits: nextSplits
  };
};

const assignSubmitAccountsForItems = async (items = []) => {
  const targets = (Array.isArray(items) ? items : []).filter((it) => it && it.status !== "CANCELLED");
  const assignments = [];

  for (const item of targets) {
    const channel = parseBookingTier(item.bookingTier || "NORMAL");
    const needSilver = isSilverRequiredNewUserRate(item);
    const nights = Math.max(1, calcNights(item.checkInDate, item.checkOutDate));
    const minCouponWallet = couponNeedFromItem(item);
    const ctx = await getInternalRequestContext({
      tier: channel.tier,
      corporateName: channel.corporateName,
      preferredAccountId: item.accountId || undefined,
      minDailyOrdersLeft: nights,
      minCouponWallet,
      candidateLimit: 120,
      requiredSilverNewUser: needSilver,
      preferNonSilverNewUser: channel.tier === "NEW_USER" && !needSilver,
      allowEnvFallback: false
    });

    if (!ctx.tokenAccountId) {
      throw new Error(needSilver
        ? "新客账号不足：该房型要求银会员新客号（PREPAIDSILV），当前无可用银卡新客账号"
        : `账号不足：${channel.channelKey} 渠道暂无满足条件的可用账号`);
    }

    if (item.accountId !== ctx.tokenAccountId || (ctx.tokenAccountPhone && item.accountPhone !== ctx.tokenAccountPhone)) {
      await prismaStore.updateOrderItem(item.id, {
        accountId: ctx.tokenAccountId,
        accountPhone: ctx.tokenAccountPhone || item.accountPhone || null
      });
    }

    assignments.push({
      itemId: item.id,
      accountId: ctx.tokenAccountId,
      accountPhone: ctx.tokenAccountPhone || null,
      channel: channel.channelKey
    });
  }

  return { assignments };
};

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
    const hasSubmitFailed = unpaidItems.some((it) => it.executionStatus === "FAILED");
    if (hasSubmitFailed) {
      return { order: latest, ready: false, timeout: false };
    }
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

const pickBoundOrderItemTokenContext = async (orderItem) => {
  if (!orderItem?.accountId) {
    throw new Error("拆单未绑定下单账号，无法发起该操作");
  }
  const credential = await prismaStore.getPoolAccountCredential(orderItem.accountId);
  const token = String(credential?.token || "").trim();
  if (!token) {
    throw new Error("拆单绑定账号token缺失，无法发起该操作");
  }
  const proxy = await prismaStore.acquireProxyNode();
  if (!proxy) {
    throw new Error("No available proxy from proxy pool");
  }
  return {
    token,
    proxy,
    tokenSource: "bound-account",
    tokenAccountId: orderItem.accountId
  };
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

      const tokenCtx = await pickBoundOrderItemTokenContext(orderItem);
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
  const isAdmin = req.auth.user.role === "ADMIN";
  const creatorScope = String(req.query.creatorScope || "ALL").toUpperCase();
  const includeDeleted = isAdmin && String(req.query.includeDeleted || "").toLowerCase() === "true";
  const requestedStatus = String(req.query.status || "").toUpperCase();
  let creatorId = undefined;

  if (!isAdmin) {
    creatorId = req.auth.user.id;
  } else if (creatorScope === "SELF") {
    creatorId = req.auth.user.id;
  } else if (creatorScope === "USER") {
    const queryCreatorId = String(req.query.creatorId || "").trim();
    if (!queryCreatorId) {
      return res.status(400).json({ message: "creatorId is required when creatorScope=USER" });
    }
    creatorId = queryCreatorId;
  }

  if (requestedStatus === "DELETED" && !includeDeleted) {
    return res.status(400).json({ message: "status=DELETED requires includeDeleted=true" });
  }

  const filters = {
    search: req.query.search,
    status: req.query.status,
    invoiceStatus: req.query.invoiceStatus,
    checkInFrom: req.query.checkInFrom,
    checkInTo: req.query.checkInTo,
    page: req.query.page,
    pageSize: req.query.pageSize,
    creatorId,
    includeDeleted
  };
  const result = await prismaStore.listOrdersPage(filters);
  return res.json({ items: result.items, data: result.items, meta: result.meta });
});

ordersRoutes.post("/", requireAuth, async (req, res) => {
  try {
    const requestPayload = expandNewUserSplitsByNight(req.body || {});
  const {
    hotelName,
    customerName,
    chainId,
    checkInDate,
    checkOutDate,
    splits
  } = requestPayload;

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
    : [{ bookingTier: requestPayload?.bookingTier || "NORMAL" }];
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

  const submitNow = requestPayload.submitNow !== false;
  const invoicePresetInput = requestPayload.invoicePreset && typeof requestPayload.invoicePreset === "object"
    ? requestPayload.invoicePreset
    : null;
  const invoicePresetEnabled = Boolean(invoicePresetInput?.enabled) && Boolean(String(invoicePresetInput?.templateId || "").trim());
  let invoicePresetTemplate = null;
  if (invoicePresetEnabled) {
    invoicePresetTemplate = await prismaStore.getInvoiceTemplateById(String(invoicePresetInput.templateId));
    if (!invoicePresetTemplate || !invoicePresetTemplate.isEnabled) {
      return res.status(400).json({ message: "invoice preset template not found or disabled" });
    }
  }

  const payloadWithReservations = submitNow
    ? await reserveNewUserAccounts(requestPayload)
    : requestPayload;

  let order = null;
  let tasks = [];
  try {
    order = await prismaStore.createOrder(payloadWithReservations, req.auth.user);

    if (invoicePresetTemplate) {
      const presetPayloadBase = {
        invoiceTemplateId: invoicePresetTemplate.id,
        invoiceId: invoicePresetTemplate.invoiceId,
        chainId: order.chainId,
        invoiceType: invoicePresetTemplate.invoiceType,
        invoiceTitleType: invoicePresetTemplate.invoiceTitleType,
        invoiceName: invoicePresetTemplate.invoiceName,
        taxNo: invoicePresetTemplate.taxNo,
        email: invoicePresetTemplate.email,
        state: "PRESET",
        stateDesc: "已预设开票需求，离店后可发起开票",
        createdBy: req.auth.user.id
      };

      for (const item of order.items) {
        await prismaStore.createInvoiceRecord({
          ...presetPayloadBase,
          orderItemId: item.id,
          orderGroupId: order.id,
          orderId: item.atourOrderId || null,
          submittedPayload: {
            source: "booking-preset",
            templateId: invoicePresetTemplate.id,
            invoiceId: invoicePresetTemplate.invoiceId
          }
        });
      }
      order = await prismaStore.getOrder(order.id);
    }

    for (const item of order.items.filter((it) => it.executionStatus === "QUEUED").sort((a, b) => a.splitIndex - b.splitIndex)) {
      const task = await enqueueOrderItemTask(item);
      tasks.push(task);
    }
  } catch (err) {
    return res.status(400).json({ message: err?.message || "create order failed" });
  }

  return res.status(201).json({
    order,
    tasks,
    paymentDecision: buildPaymentDecision(order)
  });
  } catch (err) {
    return res.status(400).json({ message: err?.message || "create order failed" });
  }
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
    const latestFailure = item.executionStatus === "FAILED"
      ? await prismaStore.getLatestOrderItemFailure(item.id)
      : null;

    if (item.executionStatus === "FAILED") {
      paymentSplits.push({
        ...toPaymentSplitView(item),
        paymentLink: null,
        linkState: "SUBMIT_FAILED",
        error: latestFailure?.message || "拆单下单失败"
      });
      continue;
    }

    if (!PAYMENT_READY_STATES.has(item.executionStatus)) {
      paymentSplits.push({
        ...toPaymentSplitView(item),
        paymentLink: null,
        linkState: "PENDING_ORDER_SUBMIT",
        error: latestFailure?.message || undefined
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

  const incoming = req.body || {};
  if (String(incoming.status || "").toUpperCase() === "DELETED") {
    return res.status(409).json({ message: "Use DELETE /api/orders/:id to hide order" });
  }

  const patch = req.auth.user.role === "ADMIN"
    ? {
      ...(hasOwn(incoming, "status") ? { status: incoming.status } : {}),
      ...(hasOwn(incoming, "paymentStatus") ? { paymentStatus: incoming.paymentStatus } : {}),
      ...(hasOwn(incoming, "remark") ? { remark: incoming.remark } : {}),
      ...(hasOwn(incoming, "totalAmount") ? { totalAmount: incoming.totalAmount } : {})
    }
    : {
      ...(hasOwn(incoming, "remark") ? { remark: incoming.remark } : {})
    };

  const updated = await prismaStore.updateOrder(req.params.id, patch);
  return res.json(updated);
});

ordersRoutes.delete("/:id", requireAuth, async (req, res) => {
  const order = await prismaStore.getOrder(req.params.id);
  if (!order) {
    return res.status(404).json({ message: "Order not found" });
  }
  if (req.auth.user.role !== "ADMIN" && order.creatorId !== req.auth.user.id) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const currentStatus = String(order.status || "");
  if (!["FAILED", "CANCELLED", "DELETED"].includes(currentStatus)) {
    return res.status(409).json({ message: "Only FAILED or CANCELLED orders can be hidden" });
  }

  const deleted = await prismaStore.softDeleteOrder(order.id);
  return res.json({ ok: true, order: deleted });
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

  const pendingForSubmit = order.items.filter(
    (it) => it.status !== "CANCELLED" && ["PLAN_PENDING", "FAILED"].includes(it.executionStatus)
  );
  try {
    await assignSubmitAccountsForItems(pendingForSubmit);
  } catch (err) {
    return res.status(409).json({ message: err?.message || "账号预检失败" });
  }

  const result = await prismaStore.submitOrder(order.id);
  const tasks = [];
  for (const item of result.items.filter((it) => it.executionStatus === "QUEUED").sort((a, b) => a.splitIndex - b.splitIndex)) {
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

  if (req.auth.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Only ADMIN can patch order items" });
  }

  const incoming = req.body || {};
  const patch = {
    ...(hasOwn(incoming, "bookingTier") ? { bookingTier: incoming.bookingTier } : {}),
    ...(hasOwn(incoming, "roomTypeId") ? { roomTypeId: incoming.roomTypeId } : {}),
    ...(hasOwn(incoming, "rateCode") ? { rateCode: incoming.rateCode } : {}),
    ...(hasOwn(incoming, "rateCodeId") ? { rateCodeId: incoming.rateCodeId } : {}),
    ...(hasOwn(incoming, "rpActivityId") ? { rpActivityId: incoming.rpActivityId } : {}),
    ...(hasOwn(incoming, "rateCodePriceType") ? { rateCodePriceType: incoming.rateCodePriceType } : {}),
    ...(hasOwn(incoming, "rateCodeActivities") ? { rateCodeActivities: incoming.rateCodeActivities } : {}),
    ...(hasOwn(incoming, "remark") ? { remark: incoming.remark } : {}),
    ...(hasOwn(incoming, "breakfastCount") ? { breakfastCount: incoming.breakfastCount } : {}),
    ...(hasOwn(incoming, "roomLevelUpCount") ? { roomLevelUpCount: incoming.roomLevelUpCount } : {}),
    ...(hasOwn(incoming, "delayedCheckOutCount") ? { delayedCheckOutCount: incoming.delayedCheckOutCount } : {}),
    ...(hasOwn(incoming, "shooseCount") ? { shooseCount: incoming.shooseCount } : {}),
    ...(hasOwn(incoming, "accountId") ? { accountId: incoming.accountId } : {}),
    ...(hasOwn(incoming, "accountPhone") ? { accountPhone: incoming.accountPhone } : {}),
    ...(hasOwn(incoming, "amount") ? { amount: incoming.amount } : {})
  };

  const updated = await prismaStore.updateOrderItem(req.params.itemId, patch);
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

  try {
    await assignSubmitAccountsForItems([item]);
  } catch (err) {
    return res.status(409).json({ message: err?.message || "账号预检失败" });
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

  if (["PAID", "REFUNDED"].includes(String(item.paymentStatus || ""))) {
    return res.status(400).json({ message: "该拆单已支付，不允许再生成支付链接" });
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
    const message = String(err?.message || "");
    if (/已支付|禁止再次生成支付链接/i.test(message)) {
      return res.status(400).json({ message: "该拆单已支付，不允许再生成支付链接" });
    }

    try {
      const latestOrder = await prismaStore.getOrder(item.groupId);
      const latestItem = await prismaStore.getOrderItemById(item.id);
      if (latestOrder && latestItem?.atourOrderId) {
        await refreshOrderItemStatusByAtour(latestOrder, latestItem, { source: "route.payment-link-fallback-check" });
      }
      const afterSync = await prismaStore.getOrderItemById(item.id);
      if (["PAID", "REFUNDED"].includes(String(afterSync?.paymentStatus || ""))) {
        return res.status(400).json({ message: "该拆单已支付，不允许再生成支付链接" });
      }
    } catch (syncErr) {
      if (env.nodeEnv !== "production") {
        console.warn("payment-link paid-state sync check failed:", syncErr?.message || syncErr);
      }
    }

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
  const accountCredential = item.accountId
    ? await prismaStore.getPoolAccountCredential(item.accountId)
    : null;
  const matchedToken = String(accountCredential?.token || "").trim();

  if (item.atourOrderId && matchedToken) {
    const detailUrl = `https://wechat.yaduo.com/atour/order/detail?${new URLSearchParams({
      chainId: String(order.chainId || ""),
      folioId: String(item.atourOrderId || ""),
      token: matchedToken
    }).toString()}`;
    return res.json({ detailUrl });
  }

  if (item.atourOrderId && !matchedToken) {
    return res.status(409).json({ message: "该拆单缺少下单账号token，无法生成官方详情链接" });
  }

  return res.json({ detailUrl: links?.detailUrl || null });
});
