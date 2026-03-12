import { prismaStore } from "../../data/prisma-store.js";
import { cancelAtourOrder } from "../../services/atour-order.service.js";

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

    if (!existing.accountId) {
      throw new Error("拆单未绑定下单账号，无法取消亚朵订单");
    }
    const credential = await prismaStore.getPoolAccountCredential(existing.accountId);
    const boundToken = String(credential?.token || "").trim();
    if (!boundToken) {
      throw new Error("拆单绑定账号token缺失，无法取消亚朵订单");
    }
    const proxy = await prismaStore.acquireProxyNode();
    if (!proxy) {
      throw new Error("No available proxy from proxy pool");
    }

    await cancelAtourOrder({
      token: boundToken,
      proxy,
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
