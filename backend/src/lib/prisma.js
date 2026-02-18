import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL && process.env.NODE_ENV !== "production") {
  const devDbUrl = new URL("../../prisma/dev.db", import.meta.url);
  process.env.DATABASE_URL = `file:${devDbUrl.pathname}`;
}

if (process.env.DATABASE_URL?.startsWith("file:./")) {
  const relative = process.env.DATABASE_URL.slice("file:".length).replace(/^\.\//, "");
  const normalizedRelative = relative.startsWith("prisma/") ? relative : `prisma/${relative}`;
  const absolute = new URL(`../../${normalizedRelative}`, import.meta.url);
  process.env.DATABASE_URL = `file:${absolute.pathname}`;
}

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
