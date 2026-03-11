import { env } from "./config/env.js";
import { taskPlatform } from "./tasks/task-platform.js";

const bootWorker = async () => {
  if (!env.taskSystemEnabled) {
    console.log("[worker] TASK_SYSTEM_ENABLED=false, worker skipped");
    return;
  }

  await taskPlatform.start({ consume: true, strict: true });
  console.log("[worker] task consumer started");

  const shutdown = async () => {
    await taskPlatform.stop().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

bootWorker().catch((err) => {
  console.error("[worker] boot failed", err);
  process.exit(1);
});
