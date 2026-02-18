import { prismaStore } from "../../data/prisma-store.js";

export const orderPaymentLinkTask = async ({ payload }) => {
  const orderItemId = payload?.orderItemId;
  const links = await prismaStore.getOrderItemLinks(orderItemId);
  if (!links) {
    throw new Error("order item not found");
  }
  return links;
};
