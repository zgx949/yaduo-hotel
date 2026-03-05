import { ProxyAgent } from "undici";
import { prismaStore } from "../data/prisma-store.js";

const dispatcherCache = new Map();

const buildProxyUri = (proxy) => {
  const protocol = "http";
  const host = String(proxy?.host || proxy?.ip || "").trim();
  const port = Number(proxy?.port || 0);
  if (!host || !port) {
    throw new Error("proxy host/port missing");
  }

  const authEnabled = Boolean(proxy?.authEnabled && proxy?.authUsername);
  if (!authEnabled) {
    return `${protocol}://${host}:${port}`;
  }

  const username = encodeURIComponent(String(proxy.authUsername || ""));
  const password = encodeURIComponent(String(proxy.authPassword || ""));
  return `${protocol}://${username}:${password}@${host}:${port}`;
};

const getDispatcher = (proxy) => {
  const key = String(proxy?.id || buildProxyUri(proxy));
  if (dispatcherCache.has(key)) {
    return dispatcherCache.get(key);
  }

  const dispatcher = new ProxyAgent({ uri: buildProxyUri(proxy) });
  dispatcherCache.set(key, dispatcher);
  return dispatcher;
};

export const fetchWithProxy = async (url, options = {}, proxy) => {
  if (!proxy) {
    throw new Error("No proxy available from proxy pool");
  }

  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 12000));
  const externalSignal = options.signal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, {
      ...options,
      timeoutMs: undefined,
      signal: controller.signal,
      dispatcher: getDispatcher(proxy)
    });

    await prismaStore.markProxyHealth(proxy.id, "ONLINE").catch(() => undefined);
    return response;
  } catch (err) {
    await prismaStore.markProxyHealth(proxy.id, "OFFLINE").catch(() => undefined);
    throw err;
  } finally {
    clearTimeout(timer);
  }
};
