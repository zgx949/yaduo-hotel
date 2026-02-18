import dotenv from "dotenv";

dotenv.config();

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: toNumber(process.env.PORT, 8787),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  apiPrefix: process.env.API_PREFIX || "/api",
  useMemoryStore: (process.env.USE_MEMORY_STORE || "true") === "true",
  atourAccessToken: process.env.ATOUR_ACCESS_TOKEN || "",
  atourClientId: process.env.ATOUR_CLIENT_ID || "363CB080-412A-4BFB-AF6E-8C3472F93814",
  atourPlatformType: process.env.ATOUR_PLATFORM_TYPE || "2",
  atourChannelId: process.env.ATOUR_CHANNEL_ID || "20001",
  atourAppVersion: process.env.ATOUR_APP_VERSION || "4.1.0",
  atourMebId: process.env.ATOUR_MEB_ID || "",
  atourCookie: process.env.ATOUR_COOKIE || "",
  atourPlaceSearchClientId:
    process.env.ATOUR_PLACE_SEARCH_CLIENT_ID || "0354EF67-0288-4C6A-89B3-A5009DD8926E",
  atourPlaceSearchBaseUrl:
    process.env.ATOUR_PLACE_SEARCH_BASE_URL || "https://api2.yaduo.com/atourlife/placeSearch/searchV2",
  atourUserAgent:
    process.env.ATOUR_USER_AGENT ||
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AtourBrowser-AtourLife/4.1.0/iOS",
  poolTokenPublicKey: process.env.POOL_TOKEN_PUBLIC_KEY || "",
  poolTokenPrivateKey: process.env.POOL_TOKEN_PRIVATE_KEY || "",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  googleApiKey: process.env.GOOGLE_API_KEY || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  taskSystemEnabled: toBoolean(process.env.TASK_SYSTEM_ENABLED, true),
  redisUrl: process.env.REDIS_URL || "",
  redisHost: process.env.REDIS_HOST || "127.0.0.1",
  redisPort: toNumber(process.env.REDIS_PORT, 6379),
  redisPassword: process.env.REDIS_PASSWORD || "",
  redisDb: toNumber(process.env.REDIS_DB, 0),
  taskPollIntervalMs: toNumber(process.env.TASK_POLL_INTERVAL_MS, 5000)
};
