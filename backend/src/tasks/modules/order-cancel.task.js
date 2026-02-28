import { prismaStore } from "../../data/prisma-store.js";
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

    const resourceCtx = await getInternalRequestContext({ tier: existing.bookingTier || undefined });
    if (!resourceCtx.token) {
      throw new Error("No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN.");
    }

    await cancelAtourOrder({
      token: resourceCtx.token,
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
