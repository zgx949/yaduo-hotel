import { env } from "../config/env.js";
import { store } from "../data/store.js";

const matchTier = (account, tier) => {
  if (!tier || tier === "NORMAL") {
    return true;
  }
  if (tier === "NEW_USER") {
    return Boolean(account.is_new_user);
  }
  if (tier === "PLATINUM") {
    return Boolean(account.is_platinum);
  }
  if (tier === "CORPORATE") {
    return Boolean(account.is_corp_user);
  }
  return true;
};

export const pickPoolTokenForInternal = (options = {}) => {
  const targetTier = options.tier ? String(options.tier).toUpperCase() : null;
  const accounts = store.listPoolAccounts({ is_online: true });
  const candidates = accounts.filter((account) => Boolean(account.token) && matchTier(account, targetTier));
  if (candidates.length === 0) {
    return null;
  }
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    token: picked.token,
    source: "pool-account",
    accountId: picked.id,
    accountPhone: picked.phone
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
