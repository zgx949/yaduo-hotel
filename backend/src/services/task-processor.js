import { store } from "../data/store.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const progressSteps = [25, 55, 85, 100];

export const processOrderTask = async (taskId) => {
  store.updateTask(taskId, { state: "active", progress: 5 });

  for (const progress of progressSteps) {
    await wait(500);
    store.updateTask(taskId, { progress });
  }

  const task = store.getTask(taskId);
  if (!task) {
    return;
  }

  store.updateTask(taskId, {
    state: "completed",
    result: {
      ok: true,
      message: "Order task completed in memory queue mode"
    }
  });

  store.updateOrder(task.orderId, {
    status: "CONFIRMED"
  });
};
