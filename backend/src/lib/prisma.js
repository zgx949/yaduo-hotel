import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
  const devDbUrl = new URL("../../prisma/dev.db", import.meta.url);
  process.env.DATABASE_URL = `file:${devDbUrl.pathname}`;
}

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
