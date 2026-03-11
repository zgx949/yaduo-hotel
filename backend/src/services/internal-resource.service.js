import { env } from "../config/env.js";
import { prismaStore } from "../data/prisma-store.js";

export const pickPoolTokenForInternal = async (options = {}) => {
  const picked = await prismaStore.acquirePoolToken({
    tier: options.tier,
    corporateName: options.corporateName,
    preferredAccountId: options.preferredAccountId,
    excludeAccountIds: options.excludeAccountIds,
    minDailyOrdersLeft: options.minDailyOrdersLeft,
    minCouponWallet: options.minCouponWallet,
    candidateLimit: options.candidateLimit
  });
  if (!picked) {
    return null;
  }
  return {
    token: picked.token,
    source: "pool-account",
    accountId: picked.accountId,
    accountPhone: picked.accountPhone
  };
};

export const getInternalRequestContext = async (options = {}) => {
  const poolTokenContext = await pickPoolTokenForInternal(options);
  const tokenContext = poolTokenContext || (options.allowEnvFallback ? {
    token: env.atourAccessToken,
    source: "env",
    accountId: null,
    accountPhone: null
  } : null);

  const proxy = await prismaStore.acquireProxyNode({ type: options.proxyType });

  return {
    token: tokenContext?.token || "",
    tokenSource: tokenContext?.source || "",
    tokenAccountId: tokenContext?.accountId || null,
    tokenAccountPhone: tokenContext?.accountPhone || null,
    proxy
  };
};
