import { env } from "../config/env.js";
import { store } from "../data/store.js";

export const pickPoolTokenForInternal = (options = {}) => {
  const picked = store.acquirePoolToken({ tier: options.tier });
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

export const getInternalRequestContext = (options = {}) => {
  const tokenContext = pickPoolTokenForInternal(options) || {
    token: env.atourAccessToken,
    source: "env",
    accountId: null,
    accountPhone: null
  };

  const proxy = store.acquireProxyNode({ type: options.proxyType });

  return {
    token: tokenContext.token,
    tokenSource: tokenContext.source,
    tokenAccountId: tokenContext.accountId,
    tokenAccountPhone: tokenContext.accountPhone,
    proxy
  };
};
