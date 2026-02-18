import { prismaStore } from "../../data/prisma-store.js";

export const accountDailyCheckinTask = async ({ proxy }) => {
  const accounts = await prismaStore.listPoolAccounts({ is_online: true });
  const sample = accounts.slice(0, 10);
  return {
    ok: true,
    totalOnline: accounts.length,
    executed: sample.length,
    proxyId: proxy?.id || null,
    message: "daily nurturing simulated"
  };
};
