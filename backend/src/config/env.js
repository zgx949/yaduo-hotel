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
  useMemoryStore: (process.env.USE_MEMORY_STORE || "true") === "true",
  atourAccessToken: process.env.ATOUR_ACCESS_TOKEN || "",
  atourClientId: process.env.ATOUR_CLIENT_ID || "363CB080-412A-4BFB-AF6E-8C3472F93814",
  atourPlatformType: process.env.ATOUR_PLATFORM_TYPE || "2",
  atourChannelId: process.env.ATOUR_CHANNEL_ID || "20001",
  atourAppVersion: process.env.ATOUR_APP_VERSION || "4.1.0",
  atourMebId: process.env.ATOUR_MEB_ID || "",
  atourCookie: process.env.ATOUR_COOKIE || "",
  atourUserAgent:
    process.env.ATOUR_USER_AGENT ||
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AtourBrowser-AtourLife/4.1.0/iOS"
};
