import { prismaStore } from "../../data/prisma-store.js";

export const orderCancelTask = async ({ payload }) => {
  const orderItemId = payload?.orderItemId;
  const item = await prismaStore.cancelOrderItem(orderItemId);
  if (!item) {
    throw new Error("order item not found");
  }
  await prismaStore.refreshOrderStatus(item.groupId);
  return { ok: true, orderItemId };
};
