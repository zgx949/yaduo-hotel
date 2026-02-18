import { app } from "./app.js";
import { env } from "./config/env.js";
import { taskPlatform } from "./tasks/task-platform.js";

const boot = async () => {
  if (env.taskSystemEnabled) {
    await taskPlatform.start();
  }

  const server = app.listen(env.port, () => {
  const tag = env.nodeEnv === "production" ? "PROD" : "DEV";
  console.log(`[${tag}] backend started at http://localhost:${env.port}${env.apiPrefix}/health`);
  });

  const shutdown = async () => {
    await taskPlatform.stop().catch(() => undefined);
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

boot().catch((err) => {
  console.error("boot failed", err);
  process.exit(1);
});
