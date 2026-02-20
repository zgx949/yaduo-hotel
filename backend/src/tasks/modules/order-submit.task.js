import { prismaStore } from "../../data/prisma-store.js";
import { submitOrderItemToAtour } from "../../services/atour-order.service.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const orderSubmitTask = async ({ payload }) => {
  const orderItemId = payload?.orderItemId;
  const item = await prismaStore.getOrderItemById(orderItemId);
  if (!item) {
    throw new Error("order item not found");
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
