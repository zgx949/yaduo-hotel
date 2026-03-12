import { prismaStore } from "../data/prisma-store.js";
import { getAtourOrderDetail } from "./atour-order.service.js";
import { parseBookingTier } from "./booking-channel.service.js";
import { getInternalRequestContext } from "./internal-resource.service.js";

const mapAtourOrderDetailToPatch = (detail = {}, currentItem = null) => {
  const orderState = Number(detail?.orderState);
  const payState = Number(detail?.payState);
  const amountCandidates = [
    detail?.roomRate,
    detail?.feeDetail?.newTotal,
    detail?.feeDetail?.depositValue,
    detail?.feeDetail?.oldTotal
  ];
  const feeAmount = amountCandidates
    .map((it) => Number(it))
    .find((it) => Number.isFinite(it) && it > 0) || 0;

  const patch = {};
  if (feeAmount > 0) {
    patch.amount = feeAmount;
  }

  if (orderState === 2) {
    patch.status = "CANCELLED";
    patch.executionStatus = "CANCELLED";
    patch.paymentStatus = currentItem?.paymentStatus === "PAID" ? "REFUNDED" : "UNPAID";
    return patch;
  }

  if (orderState === 5) {
    patch.status = "COMPLETED";
    patch.executionStatus = "DONE";
    patch.paymentStatus = payState === 1 ? "PAID" : "UNPAID";
    return patch;
  }

  if (orderState === 3) {
    patch.status = "CONFIRMED";
    patch.executionStatus = "DONE";
    patch.paymentStatus = payState === 1 ? "PAID" : "UNPAID";
    return patch;
  }

  if (orderState === 1) {
    patch.status = payState === 1 ? "CONFIRMED" : "PROCESSING";
    patch.executionStatus = payState === 1 ? "DONE" : "ORDERED";
    patch.paymentStatus = payState === 1 ? "PAID" : (currentItem?.paymentStatus === "REFUNDED" ? "REFUNDED" : "UNPAID");
    return patch;
  }

  if (payState === 1) {
    patch.paymentStatus = "PAID";
  }
  return patch;
};

const pickTokenContext = async (item) => {
  const bookingChannel = parseBookingTier(item?.bookingTier || undefined);
  const ctx = await getInternalRequestContext({
    tier: bookingChannel.tier,
    corporateName: bookingChannel.corporateName,
    preferredAccountId: item?.accountId || undefined,
    minDailyOrdersLeft: 0
  });
  if (!ctx.token) {
    throw new Error("No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN.");
  }
  if (!ctx.proxy) {
    throw new Error("No available proxy from proxy pool");
  }
  return ctx;
};

const syncSingleOrderItem = async (order, item, source) => {
  if (!item?.atourOrderId) {
    return { itemId: item?.id || "", ok: false, skipped: true, reason: "NO_ATOUR_ORDER" };
  }

  const tokenCtx = await pickTokenContext(item);
  const detail = await getAtourOrderDetail({
    token: tokenCtx.token,
    proxy: tokenCtx.proxy,
    chainId: order.chainId,
    folioId: item.atourOrderId
  });

  const patch = mapAtourOrderDetailToPatch(detail, item);
  if (Object.keys(patch).length === 0) {
    return { itemId: item.id, ok: true, skipped: true, reason: "NO_PATCH" };
  }

  const synced = await prismaStore.safeSyncOrderItemStatus(item.id, patch, {
    expectedUpdatedAt: item.updatedAt,
    source
  });

  return {
    itemId: item.id,
    ok: true,
    applied: synced.applied,
    reason: synced.reason,
    status: synced.item?.status || item.status,
    paymentStatus: synced.item?.paymentStatus || item.paymentStatus,
    orderState: Number(detail?.orderState),
    payState: Number(detail?.payState)
  };
};

export const refreshOrderItemStatusByAtour = async (order, item, options = {}) => {
  const details = await syncSingleOrderItem(order, item, options.source || "route.refresh-order-item");
  const nextItem = await prismaStore.getOrderItemById(item.id);
  if (details.applied && nextItem?.groupId) {
    await prismaStore.refreshOrderStatus(nextItem.groupId);
  }
  return { item: nextItem || item, details };
};

export const refreshOrderStatusByAtour = async (order, options = {}) => {
  const details = [];
  for (const item of order.items || []) {
    try {
      const result = await syncSingleOrderItem(order, item, options.source || "route.refresh-order");
      details.push(result);
    } catch (err) {
      details.push({ itemId: item.id, ok: false, message: err?.message || "refresh failed" });
    }
  }
  const refreshedOrder = await prismaStore.refreshOrderStatus(order.id);
  return { order: refreshedOrder, details };
};

const runScan = async ({ scanType, source, listFn, limit }) => {
  const candidates = await listFn({ limit });
  const perItem = [];
  const touchedOrderIds = new Set();

  for (const item of candidates) {
    if (!item.chainId) {
      perItem.push({ itemId: item.id, ok: false, message: "missing chainId" });
      continue;
    }

    try {
      const result = await syncSingleOrderItem({ id: item.groupId, chainId: item.chainId }, item, source);
      perItem.push(result);
      if (result.applied) {
        touchedOrderIds.add(item.groupId);
      }
    } catch (err) {
      perItem.push({ itemId: item.id, ok: false, message: err?.message || "scan failed" });
    }
  }

  for (const groupId of touchedOrderIds) {
    await prismaStore.refreshOrderStatus(groupId);
  }

  return {
    ok: true,
    scanType,
    total: candidates.length,
    applied: perItem.filter((it) => it.applied).length,
    conflicts: perItem.filter((it) => it.reason === "CONFLICT").length,
    failed: perItem.filter((it) => it.ok === false).length,
    touchedGroups: touchedOrderIds.size,
    details: perItem
  };
};

export const runUnpaidOrderPaymentStatusScan = async ({ payload = {} } = {}) => {
  const limit = Math.max(1, Math.min(500, Number(payload.limit) || 200));
  return runScan({
    scanType: "payment-status",
    source: "task.order.payment-status-scan",
    listFn: (options) => prismaStore.listOrderItemsForPaymentStatusScan(options),
    limit
  });
};

export const runPendingStayOrderStatusScan = async ({ payload = {} } = {}) => {
  const limit = Math.max(1, Math.min(1000, Number(payload.limit) || 500));
  return runScan({
    scanType: "stay-status",
    source: "task.order.stay-status-scan",
    listFn: (options) => prismaStore.listOrderItemsForStayStatusScan(options),
    limit
  });
};
