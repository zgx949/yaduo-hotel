import { env } from "../config/env.js";
import { prismaStore } from "../data/prisma-store.js";
import { parseBookingTier } from "./booking-channel.service.js";
import { getInternalRequestContext } from "./internal-resource.service.js";
import { runCouponScanTask } from "./atour-maintenance.service.js";
import { fetchWithProxy } from "./proxied-fetch.service.js";

const ALIPAY_APP_ID = "2021003121605466";
const ALIPAY_APP_BRIDGE_ID = "20000067";
const NEW_GUEST_API_BASE = "https://miniapp.yaduo.com/atourlife";
const ENC_API_URL = "http://81.68.144.211:5002/yaduoapi/get_enc_str";

const idCardWeights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const idCardCheckMap = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

const buildMockIdCardNumber = () => {
  const areaCode = "110101";
  const now = new Date();
  const year = String(Math.max(1988, now.getFullYear() - Math.floor(Math.random() * 15))).padStart(4, "0");
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, "0");
  const base = `${areaCode}${year}${month}${day}${seq}`;
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    sum += Number(base[i]) * idCardWeights[i];
  }
  return `${base}${idCardCheckMap[sum % 11]}`;
};

const isSilverRequiredNewUserRate = (item = {}) => {
  const tier = parseBookingTier(item?.bookingTier || "NORMAL");
  if (tier.tier !== "NEW_USER") {
    return false;
  }
  const rateCode = String(item?.rateCode || "").trim().toUpperCase();
  return rateCode === "PREPAIDSILV";
};

const calcNights = (checkInDate, checkOutDate) => {
  const start = new Date(String(checkInDate)).getTime();
  const end = new Date(String(checkOutDate)).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 1;
  }
  return Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
};

const resolveBoundSubmitAccount = async ({ order, item }) => {
  const bookingChannel = parseBookingTier(item?.bookingTier || undefined);
  const nights = calcNights(item?.checkInDate, item?.checkOutDate);
  const needSilverNewUser = isSilverRequiredNewUserRate(item);
  const minCouponWallet = {
    breakfast: Math.max(0, Number(item?.breakfastCount) || 0),
    upgrade: Math.max(0, Number(item?.roomLevelUpCount) || 0),
    lateCheckout: Math.max(0, Number(item?.delayedCheckOutCount) || 0),
    slippers: Math.max(0, Number(item?.shooseCount) || 0)
  };

  const ctx = await getInternalRequestContext({
    tier: bookingChannel.tier,
    corporateName: bookingChannel.corporateName,
    preferredAccountId: item?.accountId || undefined,
    minDailyOrdersLeft: Math.max(1, nights),
    minCouponWallet,
    candidateLimit: 120,
    requiredSilverNewUser: needSilverNewUser,
    preferNonSilverNewUser: bookingChannel.tier === "NEW_USER" && !needSilverNewUser,
    allowEnvFallback: false
  });

  if (!ctx.tokenAccountId) {
    throw new Error(needSilverNewUser
      ? "余额不足：该房型需银会员新客号（PREPAIDSILV），当前无可用银卡新客账号"
      : "余额不足：该渠道暂无满足条件的可用账号");
  }
  if (!ctx.proxy) {
    throw new Error("暂无可用代理节点");
  }

  const credential = await prismaStore.getPoolAccountCredential(ctx.tokenAccountId);
  const boundToken = String(credential?.token || "").trim();
  if (!boundToken) {
    throw new Error("选中的下单账号token缺失，无法提交");
  }

  if (item.accountId !== ctx.tokenAccountId || (credential?.account?.phone && item.accountPhone !== credential.account.phone)) {
    await prismaStore.updateOrderItem(item.id, {
      accountId: ctx.tokenAccountId,
      accountPhone: credential?.account?.phone || item.accountPhone || null
    });
  }

  return {
    accountId: ctx.tokenAccountId,
    accountPhone: credential?.account?.phone || item.accountPhone || null,
    token: boundToken,
    proxy: ctx.proxy
  };
};

const buildAtourQuery = (token) => {
  const params = new URLSearchParams({
    platType: env.atourPlatformType,
    appVer: env.atourAppVersion,
    inactiveId: "",
    channelId: env.atourChannelId,
    token,
    activitySource: "",
    activeId: ""
  });
  return params.toString();
};

const buildAddOrderQuery = (token) => {
  const params = new URLSearchParams({
    appVer: String(env.atourAppVersion),
    "At-App-Version": String(env.atourAppVersion),
    channelId: String(env.atourChannelId),
    deviceId: String(env.atourClientId),
    "At-Channel-Id": String(env.atourChannelId),
    "At-Platform-Type": String(env.atourPlatformType),
    platType: String(env.atourPlatformType),
    token: String(token || ""),
    activitySource: "",
    activeId: "",
    inactiveId: ""
  });
  const clientCode = String(process.env.ATOUR_CLIENT_CODE || "").trim();
  if (clientCode) {
    params.set("at-client-code", clientCode);
  }
  return params.toString();
};

const buildAtourHeaders = (token, overrides = {}) => ({
  Accept: "*/*",
  "At-Platform-Type": String(overrides.platformType || env.atourPlatformType),
  "At-Client-Id": env.atourClientId,
  "At-App-Version": String(overrides.appVersion || env.atourAppVersion),
  "Content-Type": "application/json",
  "User-Agent": env.atourUserAgent,
  "At-Access-Token": token,
  "At-Channel-Id": String(overrides.channelId || env.atourChannelId),
  ...(env.atourCookie ? { Cookie: env.atourCookie } : {})
});

const runNewGuestIdentityUpdate = async ({ token, proxy, chainId, realName }) => {
  const params = new URLSearchParams({
    token: String(token),
    platType: String(env.atourPlatformType),
    appVer: String(env.atourAppVersion),
    channelId: String(env.atourChannelId),
    activitySource: "",
    activityId: "",
    activeId: ""
  });

  const response = await fetchWithProxy(`${NEW_GUEST_API_BASE}/chain/newGuestIdentityCheck?${params.toString()}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify({
      docType: 1,
      realName: String(realName || "刘三"),
      idCardNumber: buildMockIdCardNumber(),
      chainId: String(chainId)
    }),
    timeoutMs: 12000
  }, proxy);

  const raw = await parseAtourResponse(response, "newGuestIdentityCheck failed");
  return {
    warning: Boolean(raw?.result)
  };
};

const parseAtourResponse = async (response, fallbackMessage) => {
  const rawText = await response.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    data = {};
  }

  if (Object.keys(data).length === 0) {
    const preview = String(rawText || "").slice(0, 120);
    throw new Error(`${fallbackMessage} (status=${response.status} non-json/encoded response preview=${preview})`);
  }

  if (!response.ok || data?.retcode !== 0) {
    const details = [
      `status=${response.status}`,
      `retcode=${data?.retcode ?? "unknown"}`,
      `retmsg=${data?.retmsg || ""}`
    ].join(" ").trim();
    throw new Error(`${fallbackMessage} (${details})`);
  }
  return data;
};

const isAtourSemanticNotFoundError = (err) => {
  const message = String(err?.message || "");
  return /订单不存在|order\s*not\s*exist|ORDER_NOT_EXIST/i.test(message);
};

const parseMiniappResponse = async (response, fallbackMessage) => {
  const rawText = await response.text();
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = {};
  }

  if (!response.ok || Number(data?.retcode) !== 0) {
    throw new Error(`${fallbackMessage} (status=${response.status} retcode=${data?.retcode ?? "unknown"} retmsg=${data?.retmsg || ""})`);
  }
  return data;
};

export const encryptPlainTextForAtour = async ({ text }) => {
  const plain = String(text || "").trim();
  if (!plain) {
    return "";
  }
  if (plain.startsWith("enc(")) {
    return plain;
  }
  const response = await fetch(`${ENC_API_URL}?text=${encodeURIComponent(plain)}`);
  const data = await response.json().catch(() => ({}));
  const encrypted = String(data?.data || "").trim();
  if (!response.ok || !encrypted.startsWith("enc(")) {
    throw new Error("email enc encryption failed");
  }
  return encrypted;
};

const normalizeGuestListEnc = async (guestList = [], fallbackName = "") => {
  const source = Array.isArray(guestList) && guestList.length > 0
    ? guestList
    : [{ name: fallbackName, room: 1 }];
  const output = [];
  for (const item of source) {
    const nameRaw = String(item?.name || fallbackName || "").trim();
    if (!nameRaw) {
      continue;
    }
    output.push({
      ...item,
      name: await encryptPlainTextForAtour({ text: nameRaw }),
      room: Math.max(1, Number(item?.room) || 1)
    });
  }
  return output;
};

const normalizeMobileEnc = async (mobileText = "") => {
  const raw = String(mobileText || "").trim();
  if (!raw) {
    return "";
  }
  return encryptPlainTextForAtour({ text: raw });
};

const normalizeAddOrderPayload = async ({ payload = {}, token = "" }) => {
  const next = { ...(payload || {}) };

  next.mobile = await normalizeMobileEnc(next.mobile || "");
  next.guestList = await normalizeGuestListEnc(next.guestList, next.checkInPersons || "");
  next.selectedPoint = Math.max(0, Math.floor(Number(next.selectedPoint) || 0));
  next.isPointPayAppChannel = String(next.isPointPayAppChannel || "1");

  next.appVer = String(next.appVer || env.atourAppVersion);
  next.deviceId = String(next.deviceId || env.atourClientId);
  next.channelId = String(next.channelId || env.atourChannelId);
  next.platType = String(next.platType || env.atourPlatformType);
  next["At-Client-Id"] = String(next["At-Client-Id"] || env.atourClientId);
  next["At-App-Version"] = String(next["At-App-Version"] || env.atourAppVersion);
  next["At-Channel-Id"] = String(next["At-Channel-Id"] || env.atourChannelId);
  next["At-Platform-Type"] = String(next["At-Platform-Type"] || env.atourPlatformType);
  next.token = String(next.token || token || "");
  next.invoiceTitleType = Number(next.invoiceTitleType ?? 2);
  next.guaranteed = Boolean(false);
  next.confirmNoGuarantee = Boolean(next.confirmNoGuarantee ?? false);

  return next;
};

export const getInvoiceLikeTitleOrNumber = async ({ token, proxy, titleOrNumber }) => {
  const query = new URLSearchParams({
    token: String(token || ""),
    platType: String(env.atourPlatformType),
    appVer: String(env.atourAppVersion),
    channelId: String(env.atourChannelId),
    activitySource: "",
    activityId: "",
    activeId: "",
    clientId: String(env.atourClientId)
  });
  const body = new URLSearchParams({ titleOrNumber: String(titleOrNumber || "") });

  const response = await fetchWithProxy(`${NEW_GUEST_API_BASE}/miniapp/invoice/getInvoiceLikeTitleOrNumber?${query.toString()}`, {
    method: "POST",
    headers: {
      ...buildAtourHeaders(token),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    timeoutMs: 12000
  }, proxy);
  const data = await parseMiniappResponse(response, "getInvoiceLikeTitleOrNumber failed");
  return Array.isArray(data?.result) ? data.result : [];
};

export const addMiniAppInvoiceInfoV2 = async ({ token, proxy, payload }) => {
  const query = new URLSearchParams({
    token: String(token || ""),
    platType: String(env.atourPlatformType),
    appVer: String(env.atourAppVersion),
    channelId: String(env.atourChannelId),
    activitySource: "",
    activityId: "",
    activeId: "",
    clientId: String(env.atourClientId)
  });

  const response = await fetchWithProxy(`${NEW_GUEST_API_BASE}/miniapp/invoice/addMiniAppInvoiceInfoV2?${query.toString()}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {}),
    timeoutMs: 12000
  }, proxy);
  const data = await parseMiniappResponse(response, "addMiniAppInvoiceInfoV2 failed");
  return data?.result || {};
};

export const issueEinvoiceV2 = async ({ token, proxy, payload }) => {
  const query = new URLSearchParams({
    activeId: "",
    "At-Client-Id": String(env.atourClientId),
    activitySource: "",
    channelId: String(env.atourChannelId),
    "At-App-Version": String(env.atourAppVersion),
    platType: String(env.atourPlatformType),
    "At-Channel-Id": String(env.atourChannelId),
    inactiveId: "",
    appVer: String(env.atourAppVersion),
    deviceId: String(env.atourClientId),
    token: String(token || ""),
    "At-Platform-Type": String(env.atourPlatformType)
  });

  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/invoice/issueEinvoiceV2?${query.toString()}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {}),
    timeoutMs: 12000
  }, proxy);
  const data = await parseAtourResponse(response, "issueEinvoiceV2 failed");
  return data?.result || {};
};

export const getInvoiceInfoByOrder = async ({ token, proxy, chainId, orderId }) => {
  const query = new URLSearchParams({
    r: String(Math.random()),
    token: String(token || ""),
    platType: String(env.atourPlatformType),
    appVer: String(env.atourAppVersion),
    channelId: String(env.atourChannelId),
    chainId: String(chainId || ""),
    orderId: String(orderId || "")
  });

  const response = await fetchWithProxy(`${NEW_GUEST_API_BASE}/miniapp/invoice/getInvoiceInfoByOrder?${query.toString()}`, {
    method: "GET",
    headers: {
      ...buildAtourHeaders(token),
      Accept: "application/json, text/plain, */*"
    },
    timeoutMs: 12000
  }, proxy);
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new Error(`getInvoiceInfoByOrder failed (status=${response.status})`);
  }
  if (Number(data?.retcode) === 0) {
    return { found: true, result: data?.result || null };
  }
  return { found: false, result: null, retcode: Number(data?.retcode) || -1, retmsg: String(data?.retmsg || "") };
};

export const calculateOrderV2 = async ({ token, payload, proxy }) => {
  const query = buildAtourQuery(token);
  const newPayload = {...payload};
  newPayload.mobile = "";
  newPayload.checkInPersons = "";
  delete newPayload.createPayload;
  // 银卡下单强制转为新用户
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/order/calculateOrderV2?${query}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(newPayload || {}),
    timeoutMs: 12000
  }, proxy);
  const data = await parseAtourResponse(response, "calculateOrderV2 failed");
  if (!data?.result || (typeof data.result === "object" && Object.keys(data.result).length === 0)) {
    throw new Error(`calculateOrderV2 returned empty result (retcode=${data?.retcode ?? "unknown"} retmsg=${data?.retmsg || ""})`);
  }
  return data.result || {};
};

export const addAppOrder = async ({ token, payload, proxy }) => {
  const query = buildAddOrderQuery(token);
  const normalizedPayload = await normalizeAddOrderPayload({ payload, token });
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/order/addAppOrder?${query}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(normalizedPayload || {}),
    timeoutMs: 12000
  }, proxy);
  const data = await parseAtourResponse(response, "addAppOrder failed");
  return data.result || {};
};

const listChainCouponsForChain = async ({ token, proxy, chainId }) => {
  const params = new URLSearchParams({
    platType: env.atourPlatformType,
    appVer: env.atourAppVersion,
    channelId: env.atourChannelId,
    "At-Platform-Type": env.atourPlatformType,
    "At-Client-Id": env.atourClientId,
    "At-App-Version": env.atourAppVersion,
    "At-Channel-Id": env.atourChannelId,
    deviceId: env.atourClientId,
    token: String(token),
    chainId: String(chainId),
    inactiveId: "",
    activitySource: "",
    activeId: ""
  });

  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/coupon/center/list/forChain?${params.toString()}`, {
    method: "GET",
    headers: buildAtourHeaders(token),
    timeoutMs: 12000
  }, proxy);
  const data = await parseAtourResponse(response, "coupon center list for chain failed");
  return Array.isArray(data?.result) ? data.result : [];
};

const claimCouponByReAuditCode = async ({ token, proxy, reAuditCode }) => {
  const params = new URLSearchParams({
    platType: env.atourPlatformType,
    appVer: env.atourAppVersion,
    channelId: env.atourChannelId,
    "At-Platform-Type": env.atourPlatformType,
    "At-Client-Id": env.atourClientId,
    "At-App-Version": env.atourAppVersion,
    "At-Channel-Id": env.atourChannelId,
    deviceId: env.atourClientId,
    token: String(token),
    reAuditCode: String(reAuditCode),
    inactiveId: "",
    activitySource: "",
    activeId: ""
  });
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/coupon/center/getCoupon?${params.toString()}`, {
    method: "GET",
    headers: buildAtourHeaders(token),
    timeoutMs: 12000
  }, proxy);
  await parseAtourResponse(response, "claim coupon failed");
};

const listUsableCouponsForOrder = async ({
  token,
  proxy,
  chainId,
  rpActivityId,
  startDate,
  endDate,
  defaultAmount,
  roomTypeId
}) => {
  const payload = new URLSearchParams({
    channelId: String(env.atourChannelId),
    activitySource: "",
    activeId: "",
    platType: String(env.atourPlatformType),
    r: String(Math.random()),
    token: String(token),
    chainId: String(chainId),
    type: "2",
    rpActivityId: String(rpActivityId),
    startDate: String(startDate),
    endDate: String(endDate),
    defaultAmount: String(defaultAmount),
    roomTypeId: String(roomTypeId),
    appVer: String(env.atourAppVersion)
  });
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/coupon/getMebDiscountCouponsListByChainNew`, {
    method: "POST",
    headers: {
      ...buildAtourHeaders(token),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString(),
    timeoutMs: 12000
  }, proxy);
  const data = await parseAtourResponse(response, "query usable coupons failed");
  const list = Array.isArray(data?.result?.discountCouponList) ? data.result.discountCouponList : [];
  return list
    .map((it) => ({
      code: String(it?.code || "").trim(),
      value: Number(it?.value) || 0,
      endDate: String(it?.endDate || ""),
      disTypeCode: Number(it?.disCountTypeCode || it?.disType || 0)
    }))
    .filter((it) => Boolean(it.code));
};

const computeNightCount = (startDate, endDate) => {
  const startMs = new Date(String(startDate || "")).getTime();
  const endMs = new Date(String(endDate || "")).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 1;
  }
  const diff = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff);
};

const buildCouponsForAddOrder = async ({
  token,
  proxy,
  chainId,
  rpActivityId,
  startDate,
  endDate,
  defaultAmount,
  roomTypeId
}) => {
  try {
    const centerList = await listChainCouponsForChain({ token, proxy, chainId });
    const claimableCodes = centerList
      .filter((it) => Boolean(it?.canGet) && it?.reAuditCode)
      .map((it) => String(it.reAuditCode));

    if (claimableCodes.length > 0) {
      await Promise.allSettled(claimableCodes.map((reAuditCode) => claimCouponByReAuditCode({ token, proxy, reAuditCode })));
    }

    const coupons = await listUsableCouponsForOrder({
      token,
      proxy,
      chainId,
      rpActivityId,
      startDate,
      endDate,
      defaultAmount,
      roomTypeId
    });

    const nightCount = computeNightCount(startDate, endDate);
    const selected = coupons
      .sort((a, b) => {
        if (b.value !== a.value) {
          return b.value - a.value;
        }
        if (a.endDate !== b.endDate) {
          return a.endDate.localeCompare(b.endDate);
        }
        return a.code.localeCompare(b.code);
      })
      .slice(0, nightCount)
      .map((it) => it.code);

    return Array.from(new Set(selected)).join(",");
  } catch (err) {
    if (env.nodeEnv !== "production") {
      console.warn("coupon workflow failed, continue without coupons:", err?.message || err);
    }
    return "";
  }
};

export const cancelAtourOrder = async ({
  token,
  proxy,
  chainId,
  folioId,
  reason = "OTHER",
  reasonBody = ""
}) => {
  if (!token) {
    throw new Error("cancelOrder failed (missing token)");
  }
  if (!chainId || !folioId) {
    throw new Error("cancelOrder failed (missing chainId or folioId)");
  }

  const payload = new URLSearchParams({
    channelId: String(env.atourChannelId),
    activitySource: "",
    activeId: "",
    platType: String(env.atourPlatformType),
    r: String(Math.random()),
    token: String(token),
    chainId: String(chainId),
    folioId: String(folioId),
    reason: String(reason || "OTHER"),
    reasonBody: String(reasonBody || ""),
    appVer: String(env.atourAppVersion)
  });

  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/order/cancelOrder`, {
    method: "POST",
    headers: {
      ...buildAtourHeaders(token),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString(),
    timeoutMs: 12000
  }, proxy);

  const data = await parseAtourResponse(response, "cancelOrder failed");
  return data.result || {};
};

export const getAtourOrderDetail = async ({ token, proxy, chainId, folioId }) => {
  if (!token) {
    throw new Error("getOrderDetail failed (missing token)");
  }
  if (!chainId || !folioId) {
    throw new Error("getOrderDetail failed (missing chainId or folioId)");
  }

  const requestVariants = [
    {
      channelId: String(env.atourChannelId),
      platType: String(env.atourPlatformType),
      appVer: String(env.atourAppVersion)
    },
    {
      channelId: "3000001",
      platType: String(env.atourPlatformType),
      appVer: String(env.atourAppVersion)
    },
    {
      channelId: String(env.atourChannelId),
      platType: "5",
      appVer: String(env.atourAppVersion)
    },
    {
      channelId: "3000001",
      platType: "5",
      appVer: "3.31.0"
    }
  ].filter((it, idx, arr) => arr.findIndex((x) => `${x.channelId}|${x.platType}|${x.appVer}` === `${it.channelId}|${it.platType}|${it.appVer}`) === idx);

  let lastError = null;
  for (const variant of requestVariants) {
    const payload = new URLSearchParams({
      channelId: variant.channelId,
      activitySource: "",
      activeId: "",
      platType: variant.platType,
      r: String(Math.random()),
      token: String(token),
      chainId: String(chainId),
      folioId: String(folioId),
      appVer: variant.appVer
    });

    const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/order/getOrderDetail`, {
      method: "POST",
      headers: {
        ...buildAtourHeaders(token, {
          channelId: variant.channelId,
          platformType: variant.platType,
          appVersion: variant.appVer
        }),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload.toString(),
      timeoutMs: 12000
    }, proxy);

    try {
      const data = await parseAtourResponse(response, "getOrderDetail failed");
      return data.result || {};
    } catch (err) {
      lastError = err;
      if (!isAtourSemanticNotFoundError(err)) {
        throw err;
      }
    }
  }

  throw lastError || new Error("getOrderDetail failed");
};

export const createPayOrder = async ({ token, payload, proxy }) => {
  const query = buildAtourQuery(token);
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/pay/createPayOrder?${query}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {}),
    timeoutMs: 12000
  }, proxy);
  const data = await parseAtourResponse(response, "createPayOrder failed");
  return data.result || {};
};

export const getCashierInformation = async ({ token, payload, proxy }) => {
  const response = await fetchWithProxy(`${env.atourUserGatewayBaseUrl}/api/cash/atour-cash-ser/cashier/information`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {}),
    timeoutMs: 12000
  }, proxy);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.respCode !== "SUCCESS") {
    throw new Error(data?.respDesc || "cashier information failed");
  }
  return data.data || {};
};

export const payByCashier = async ({ token, payload, proxy }) => {
  const response = await fetchWithProxy(`${env.atourUserGatewayBaseUrl}/api/cash/atour-cash-ser/cashier/pay`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {}),
    timeoutMs: 12000
  }, proxy);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.respCode !== "SUCCESS") {
    throw new Error(data?.respDesc || "cashier pay failed");
  }
  return data.data || {};
};

const toAtourDate = (input) => {
  if (!input) {
    return new Date().toISOString().slice(0, 10);
  }
  return new Date(input).toISOString().slice(0, 10);
};

const buildAccommodationPayloadFromItem = (item = {}) => {
  const breakfastCount = Math.max(0, Number(item?.breakfastCount) || 0);
  const roomLevelUpCount = Math.max(0, Number(item?.roomLevelUpCount) || 0);
  const delayedCheckOutCount = Math.max(0, Number(item?.delayedCheckOutCount) || 0);
  const shooseCount = Math.max(0, Number(item?.shooseCount) || 0);

  return {
    breakfastCount,
    roomLevelUpCount,
    delayedCheckOutCount,
    shooseCount,
    accommodationType: "40,39,41,42",
    accommodationCount: `${breakfastCount},${roomLevelUpCount},${delayedCheckOutCount},${shooseCount}`
  };
};

const buildCalculatePayloadFromItem = ({ order, item, customerName, customerPhone }) => {
  const resolvedRpActivityId = item.rpActivityId || item.rateCodeId;
  if (!item.rateCode || !resolvedRpActivityId || !item.roomTypeId) {
    throw new Error("missing rateCode/rpActivityId(room rate id)/roomTypeId on order item");
  }
  const start = toAtourDate(item.checkInDate);
  const end = toAtourDate(item.checkOutDate);
  const accommodation = buildAccommodationPayloadFromItem(item);
  return {
    accommodationType: accommodation.accommodationType,
    accommodationCount: accommodation.accommodationCount,
    chainId: String(order.chainId),
    roomTypeId: String(item.roomTypeId),
    marketCode: "ABR",
    isPointPayAppChannel: "1",
    needSelfCheckIn: 0,
    firstRequest: "1",
    selfCheckIn: 1,
    roomCount: Number(item.roomCount) || 1,
    start,
    end,
    rateCode: String(item.rateCode),
    rpActivityId: String(resolvedRpActivityId),
    rateCodePriceType: String(item.rateCodePriceType || "1"),
    rateCodeActivities: item.rateCodeActivities || "",
    mobile: customerPhone || "",
    delegatorId: "",
    coupons: "",
    checkInPersons: customerName || "",
    couponCodes: []
  };
};

const resolveSelectedPoint = ({ accountPoints, orderAmount, calculateResult, requestedPoint }) => {
  const maxByRule = 3000;
  const maxByAmount = Math.max(0, Math.floor(Number(orderAmount) || 0));
  const maxByAccount = Math.max(0, Math.floor(Number(accountPoints) || 0));
  const calcPointCapRaw = Number(calculateResult?.pointPayMaxPoint ?? calculateResult?.maxPoint ?? Number.POSITIVE_INFINITY);
  const maxByCalculate = Number.isFinite(calcPointCapRaw)
    ? Math.max(0, Math.floor(calcPointCapRaw))
    : Number.POSITIVE_INFINITY;
  const base = requestedPoint !== undefined && requestedPoint !== null
    ? Math.max(0, Math.floor(Number(requestedPoint) || 0))
    : maxByAccount;
  return (Math.max(0, Math.min(base, maxByRule, maxByAmount, maxByAccount, maxByCalculate))/100)*100;
};

const buildAddOrderPayloadFromItem = async ({
  calculateResult,
  calculatePayload,
  customerName,
  customerPhone,
  orderItem,
  coupons,
  accountPoints,
  requestedPoint
}) => {
  const itemRemark = orderItem?.remark ? String(orderItem.remark) : "";
  const accommodation = buildAccommodationPayloadFromItem(orderItem || {});
  const breakfastCount = accommodation.breakfastCount;
  const roomLevelUpCount = accommodation.roomLevelUpCount;
  const delayedCheckOutCount = accommodation.delayedCheckOutCount;
  const shooseCount = accommodation.shooseCount;
  const orderAmount = Number(calculateResult.defaultAmount || calculateResult.amount || 0);
  const selectedPoint = resolveSelectedPoint({
    accountPoints,
    orderAmount,
    calculateResult,
    requestedPoint
  });

  const encryptedMobile = await normalizeMobileEnc(customerPhone || "");
  const encryptedGuestList = await normalizeGuestListEnc([], customerName || "");

  return {
    inactiveId: "", // 发票信息id
    activeId: "",
    repeatToken: String(calculateResult.repeatToken || ""),

    appVer: "4.8.1",
    deviceId: String(env.atourClientId),
    channelId: String(env.atourChannelId),
    platType: String(env.atourPlatformType),
    "At-Client-Id": String(env.atourClientId),
    "At-App-Version": String(env.atourAppVersion),
    "At-Channel-Id": String(env.atourChannelId),
    "At-Platform-Type": String(env.atourPlatformType),
    token: "",

    invoiceId: "",
    invoiceType: "",
    invoiceEmail: "",
    invoiceRemark: "",
    invoiceTitleType: 2,

    remark: itemRemark,
    mergeInvoice: "",
    rateCode: calculatePayload.rateCode,
    rateCodePriceType: String(calculatePayload.rateCodePriceType || "2"),
    roomCount: calculatePayload.roomCount,
    recipientsMobile: "",
    start: calculatePayload.start,
    recipientsName: "",
    customerNeedList: [],
    expectArrivalTime: "",
    getType: "0",
    accommodationType: String(accommodation.accommodationType),
    accommodationCount: String(accommodation.accommodationCount),
    rpActivityId: calculatePayload.rpActivityId,
    checkInPersons: customerName || "",
    isPointPayAppChannel: "1",
    selectedPoint,
    end: calculatePayload.end,
    breakfastCount,
    roomLevelUpCount,
    delayedCheckOutCount,
    shooseCount,
    coupons: String(coupons || ""),
    delegatorId: "",
    mailAddr: "",
    orderAmount,
    roomTypeId: Number(calculatePayload.roomTypeId),
    mobile: encryptedMobile,
    customerNeeds: [],
    guestList: encryptedGuestList,
    aplusParam: calculateResult.aplusParam || {
      usePoint: selectedPoint > 0,
      aplusParamList: []
    },
    guaranteed: false,
    confirmNoGuarantee: false,
    chainId: Number(calculatePayload.chainId),
    rateCodeActivities: calculatePayload.rateCodeActivities || ""
  };
};

export const runAtourOrderWorkflow = async ({ token, proxy, calculatePayload }) => {
  const calculateResult = await calculateOrderV2({ token, proxy, payload: calculatePayload });
  const createPayload = calculatePayload.createPayload || {};
  const couponCodes = await buildCouponsForAddOrder({
    token,
    proxy,
    chainId: calculatePayload.chainId,
    rpActivityId: calculatePayload.rpActivityId,
    startDate: calculatePayload.start,
    endDate: calculatePayload.end,
    defaultAmount: Number(calculateResult.defaultAmount || calculateResult.amount || 0),
    roomTypeId: calculatePayload.roomTypeId
  });
  const addPayload = {
    ...await buildAddOrderPayloadFromItem({
      calculateResult,
      calculatePayload,
      customerName: createPayload.customerName,
      customerPhone: createPayload.customerPhone,
      orderItem: createPayload.orderItem || null,
      coupons: couponCodes,
      accountPoints: createPayload.accountPoints,
      requestedPoint: createPayload.selectedPoint
    }),
    ...(createPayload.overrideAddPayload || {})
  };
  const addResult = await addAppOrder({ token, proxy, payload: addPayload });
  const payOrderPayload = {
    chainId: String(calculatePayload.chainId),
    source: "order",
    orderNo: addResult.orderId,
    busType: "room_order",
    ...(createPayload.overridePayOrderPayload || {})
  };
  const payOrderResult = await createPayOrder({ token, proxy, payload: payOrderPayload });
  const cashierPayload = {
    appFlag: "1",
    reqSeqId: String(Date.now()),
    appVersion: "1.0.3",
    token: payOrderResult.token,
    payTermType: "APP",
    ...(createPayload.overrideCashierPayload || {})
  };
  const cashierInformation = await getCashierInformation({ token, proxy, payload: cashierPayload });

  return {
    calculateResult,
    addResult,
    payOrderResult,
    cashierInformation
  };
};

export const submitOrderItemToAtour = async ({ orderItemId }) => {
  const item = await prismaStore.getOrderItemById(orderItemId);
  if (!item) {
    throw new Error("order item not found");
  }
  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    throw new Error("order not found");
  }

  const calculatePayload = buildCalculatePayloadFromItem({
    order,
    item,
    customerName: order.customerName,
    customerPhone: order.contactPhone
  });

  const binding = await resolveBoundSubmitAccount({ order, item });
  const boundToken = binding.token;
  const proxy = binding.proxy;

  const bookingChannel = parseBookingTier(item.bookingTier || undefined);
  const accountInfo = await prismaStore.getPoolAccount(binding.accountId).catch(() => null);
  const accountPoints = Math.max(0, Number(accountInfo?.points) || 0);

  await runCouponScanTask({
    payload: { accountId: binding.accountId, chainId: order.chainId },
    proxy
  }).catch(() => undefined);

  if (bookingChannel.tier === "NEW_USER") {
    await runNewGuestIdentityUpdate({
      token: boundToken,
      proxy,
      chainId: order.chainId,
      realName: order.customerName || "刘三"
    });
  }

  const workflow = await runAtourOrderWorkflow({
    token: boundToken,
    proxy,
    calculatePayload: {
      ...calculatePayload,
      createPayload: {
        customerName: order.customerName,
        customerPhone: binding.accountPhone || order.contactPhone,
        accountPoints,
        orderItem: {
          remark: item.remark || order.remark || "",
          breakfastCount: Number(item.breakfastCount) || 0,
          roomLevelUpCount: Number(item.roomLevelUpCount) || 0,
          delayedCheckOutCount: Number(item.delayedCheckOutCount) || 0,
          shooseCount: Number(item.shooseCount) || 0
        }
      }
    }
  });

  await prismaStore.applyOrderItemSubmitSuccess(orderItemId, {
    atourOrderId: workflow.addResult.orderId ? String(workflow.addResult.orderId) : null,
    accountId: binding.accountId,
    accountPhone: binding.accountPhone,
    status: "CONFIRMED",
    executionStatus: "ORDERED"
  });
  await prismaStore.refreshOrderStatus(item.groupId);

  await runCouponScanTask({
    payload: { accountId: binding.accountId, chainId: order.chainId },
    proxy
  }).catch(() => undefined);

  return {
    tokenSource: "bound-account",
    tokenAccountId: binding.accountId,
    proxyId: proxy?.id || null,
    ...workflow
  };
};

const buildAlipayDeepLink = ({ paymentOrderNo, payOrgMerId }) => {
  const page = encodeURIComponent(`pages/cashier/cashier?p=${paymentOrderNo}&s=app`);
  const params = new URLSearchParams({
    appId: ALIPAY_APP_ID,
    thirdPartSchema: "atourlifeALiPay://",
    page,
    bank_switch: "Y"
  });
  if (payOrgMerId) {
    params.set("payOrgMerId", String(payOrgMerId));
  }
  return `alipays://platformapi/startapp?${params.toString()}`;
};

const buildAlipayPayInfoLink = (payInfo) => {
  return payInfo;
};

export const generateOrderItemPaymentLink = async ({ orderItemId }) => {
  const item = await prismaStore.getOrderItemById(orderItemId);
  if (!item) {
    throw new Error("order item not found");
  }
  if (!item.atourOrderId) {
    throw new Error("order item has no atour order id");
  }
  if (["PAID", "REFUNDED"].includes(String(item.paymentStatus || ""))) {
    throw new Error("该拆单已支付，禁止再次生成支付链接");
  }

  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    throw new Error("order not found");
  }

  if (!item.accountId) {
    throw new Error("拆单未绑定下单账号，无法生成支付链接");
  }
  const credential = await prismaStore.getPoolAccountCredential(item.accountId);
  const boundToken = String(credential?.token || "").trim();
  if (!boundToken) {
    throw new Error("拆单绑定账号token缺失，无法生成支付链接");
  }
  const proxy = await prismaStore.acquireProxyNode();
  if (!proxy) {
    throw new Error("暂无可用代理节点");
  }

  const payOrderResult = await createPayOrder({
    token: boundToken,
    proxy,
    payload: {
      chainId: String(order.chainId),
      source: "order",
      orderNo: item.atourOrderId,
      busType: "room_order"
    }
  });

  const cashierInformation = await getCashierInformation({
    token: boundToken,
    proxy,
    payload: {
      appFlag: "1",
      reqSeqId: String(Date.now()),
      appVersion: "1.0.3",
      token: String(payOrderResult.token || ""),
      payTermType: "APP"
    }
  });

  const merConfigList = Array.isArray(cashierInformation.merConfigInfoList)
    ? cashierInformation.merConfigInfoList
    : [];
  const alipayConfig = merConfigList.find((it) => String(it?.payType || "") === "A") || merConfigList[0] || null;

  const paymentOrderNo = String(
    cashierInformation.paymentOrderNo ||
    cashierInformation.payOrderNo ||
    payOrderResult.token ||
    cashierInformation.busiOrderId ||
    item.atourOrderId
  );
  const payOrgMerId = alipayConfig?.payOrgMerId ? String(alipayConfig.payOrgMerId) : "";
  const channelType = alipayConfig?.channelType ? String(alipayConfig.channelType) : "I004";

  let payData = null;
  if (payOrgMerId && payOrderResult.token) {
    payData = await payByCashier({
      token: boundToken,
      proxy,
      payload: {
        channelType,
        payType: "A",
        isPreAtourAsset: String(cashierInformation.isPreAtourAsset || "N"),
        partner: payOrgMerId,
        reqSeqId: String(Date.now()),
        appId: "",
        token: String(payOrderResult.token),
        termType: "APP"
      }
    });
  }

  const payInfo = payData?.payInfo ? String(payData.payInfo) : "";
  const paymentLink = payInfo
    ? buildAlipayPayInfoLink(payInfo)
    : buildAlipayDeepLink({ paymentOrderNo, payOrgMerId });

  return {
    paymentLink,
    paymentOrderNo,
    payOrgMerId,
    channelType,
    payInfo,
    tokenSource: "bound-account",
    tokenAccountId: item.accountId,
    proxyId: proxy?.id || null,
    raw: {
      payOrderResult,
      cashierInformation,
      payData
    }
  };
};
