import { prismaStore } from "../data/prisma-store.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const progressSteps = [25, 55, 85, 100];

export const processOrderTask = async (taskId) => {
  await prismaStore.updateTask(taskId, { state: "active", progress: 5 });
  const initialTask = await prismaStore.getTask(taskId);
  if (initialTask) {
    await prismaStore.updateOrderItem(initialTask.orderItemId, {
      executionStatus: "SUBMITTING",
      status: "PROCESSING"
    });
  }

  for (const progress of progressSteps) {
    await wait(500);
    await prismaStore.updateTask(taskId, { progress });
  }

  const task = await prismaStore.getTask(taskId);
  if (!task) {
    return;
  }

  await prismaStore.updateTask(taskId, {
    state: "completed",
    result: {
      ok: true,
      message: "Order submit finished, waiting confirmation"
    }
  });

  const before = await prismaStore.getOrderItemById(task.orderItemId);
  await prismaStore.updateOrderItem(task.orderItemId, {
    executionStatus: "ORDERED",
    status: "CONFIRMED",
    atourOrderId: before?.atourOrderId || `AT-${Date.now()}-${task.orderItemId.slice(-4)}`
  });

  const orderItem = await prismaStore.getOrderItemById(task.orderItemId);
  if (orderItem?.groupId) {
    await prismaStore.refreshOrderStatus(orderItem.groupId);
  }
};
