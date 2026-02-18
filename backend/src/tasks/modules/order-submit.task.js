import { prismaStore } from "../../data/prisma-store.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const orderSubmitTask = async ({ payload }) => {
  const orderItemId = payload?.orderItemId;
  const item = await prismaStore.getOrderItemById(orderItemId);
  if (!item) {
    throw new Error("order item not found");
  }
  await prismaStore.updateOrderItem(orderItemId, { executionStatus: "SUBMITTING", status: "PROCESSING" });
  await wait(1200);
  const atourOrderId = item.atourOrderId || `AT-${Date.now()}-${orderItemId.slice(-4)}`;
  await prismaStore.updateOrderItem(orderItemId, {
    atourOrderId,
    executionStatus: "ORDERED",
    status: "CONFIRMED"
  });
  await prismaStore.refreshOrderStatus(item.groupId);
  return { ok: true, orderItemId, atourOrderId };
};
