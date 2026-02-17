import { app } from "./app.js";
import { env } from "./config/env.js";

app.listen(env.port, () => {
  const tag = env.nodeEnv === "production" ? "PROD" : "DEV";
  console.log(`[${tag}] backend started at http://localhost:${env.port}${env.apiPrefix}/health`);
});
