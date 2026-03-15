import { prismaStore } from "../data/prisma-store.js";
import { submitOrderItemToAtour } from "./atour-order.service.js";

export const processOrderTask = async (taskId) => {
  await prismaStore.updateTask(taskId, { state: "active", progress: 5 });

  const task = await prismaStore.getTask(taskId);
  if (!task) {
    return;
  }

  const result = await submitOrderItemToAtour({ orderItemId: task.orderItemId });

  await prismaStore.updateTask(taskId, {
    state: "completed",
    progress: 100,
    result: {
      ok: true,
      orderItemId: task.orderItemId,
      atourOrderId: result?.addResult?.orderId ? String(result.addResult.orderId) : null,
      tokenAccountId: result?.tokenAccountId || null,
      skipped: Boolean(result?.alreadyProcessed || result?.inProgress),
      message: result?.alreadyProcessed
        ? "Order item already processed"
        : (result?.inProgress ? "Order item is already submitting" : "Order submit finished")
    }
  });

  const orderItem = await prismaStore.getOrderItemById(task.orderItemId);
  if (orderItem?.groupId) {
    await prismaStore.refreshOrderStatus(orderItem.groupId);
  }
};
