import { prismaStore } from "../../data/prisma-store.js";
import { canUserUseBookingTier, parseBookingTier } from "../../services/booking-channel.service.js";
import { submitOrderItemToAtour } from "../../services/atour-order.service.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const orderSubmitTask = async ({ payload }) => {
  const orderItemId = payload?.orderItemId;
  const item = await prismaStore.getOrderItemById(orderItemId);
  if (!item) {
    throw new Error("order item not found");
  }

  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    throw new Error("order not found");
  }

  const creator = await prismaStore.getUserById(order.creatorId);
  if (!creator) {
    throw new Error("order creator not found");
  }

  const systemConfig = await prismaStore.getSystemConfig();
  const channel = parseBookingTier(item.bookingTier || "NORMAL");
  const permissionCheck = canUserUseBookingTier({
    user: creator,
    channel,
    systemChannels: systemConfig.channels
  });
  if (!permissionCheck.ok) {
    throw new Error(permissionCheck.message || "余额不足");
  }

  await prismaStore.updateOrderItem(orderItemId, { executionStatus: "SUBMITTING", status: "PROCESSING" });
  await wait(200);
  const result = await submitOrderItemToAtour({ orderItemId });
  return {
    ok: true,
    orderItemId,
    atourOrderId: result?.addResult?.orderId ? String(result.addResult.orderId) : item.atourOrderId || null,
    tokenSource: result.tokenSource,
    tokenAccountId: result.tokenAccountId,
    proxyId: result.proxyId
  };
};
