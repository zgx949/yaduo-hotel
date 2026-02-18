import { env } from "../config/env.js";
import { prismaStore } from "../data/prisma-store.js";

export const pickPoolTokenForInternal = async (options = {}) => {
  const picked = await prismaStore.acquirePoolToken({ tier: options.tier });
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
  const tokenContext = await pickPoolTokenForInternal(options) || {
    token: env.atourAccessToken,
    source: "env",
    accountId: null,
    accountPhone: null
  };

  const proxy = await prismaStore.acquireProxyNode({ type: options.proxyType });

  return {
    token: tokenContext.token,
    tokenSource: tokenContext.source,
    tokenAccountId: tokenContext.accountId,
    tokenAccountPhone: tokenContext.accountPhone,
    proxy
  };
};
