import { prismaStore } from "../../data/prisma-store.js";
import { parseBookingTier } from "../../services/booking-channel.service.js";
import { cancelAtourOrder } from "../../services/atour-order.service.js";
import { getInternalRequestContext } from "../../services/internal-resource.service.js";

export const orderCancelTask = async ({ payload }) => {
  const orderItemId = payload?.orderItemId;
  const existing = await prismaStore.getOrderItemById(orderItemId);
  if (!existing) {
    throw new Error("order item not found");
  }

  if (existing.status === "CANCELLED") {
    return { ok: true, orderItemId, skipped: true };
  }

  if (existing.atourOrderId) {
    const order = await prismaStore.getOrder(existing.groupId);
    if (!order) {
      throw new Error("order not found");
    }

    const bookingChannel = parseBookingTier(existing.bookingTier || undefined);
    const resourceCtx = await getInternalRequestContext({
      tier: bookingChannel.tier,
      corporateName: bookingChannel.corporateName,
      preferredAccountId: existing.accountId || undefined,
      minDailyOrdersLeft: 0
    });
    if (!resourceCtx.token) {
      throw new Error("No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN.");
    }
    if (!resourceCtx.proxy) {
      throw new Error("No available proxy from proxy pool");
    }

    await cancelAtourOrder({
      token: resourceCtx.token,
      proxy: resourceCtx.proxy,
      chainId: order.chainId,
      folioId: existing.atourOrderId,
      reason: payload?.reason || "OTHER",
      reasonBody: payload?.reasonBody || ""
    });
  }

  const item = await prismaStore.cancelOrderItem(orderItemId);
  await prismaStore.refreshOrderStatus(item.groupId);
  return { ok: true, orderItemId, atourCancelled: Boolean(existing.atourOrderId) };
};
