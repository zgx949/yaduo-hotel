import dotenv from "dotenv";

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 8787),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  apiPrefix: process.env.API_PREFIX || "/api",
  useMemoryStore: (process.env.USE_MEMORY_STORE || "true") === "true"
};
