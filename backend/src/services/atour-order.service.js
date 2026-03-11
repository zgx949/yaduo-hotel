import { env } from "../config/env.js";
import { prismaStore } from "../data/prisma-store.js";
import { parseBookingTier } from "./booking-channel.service.js";
import { getInternalRequestContext } from "./internal-resource.service.js";
import { runCouponScanTask } from "./atour-maintenance.service.js";
import { fetchWithProxy } from "./proxied-fetch.service.js";

const ALIPAY_APP_ID = "2021003121605466";
const ALIPAY_APP_BRIDGE_ID = "20000067";
const NEW_GUEST_API_BASE = "https://miniapp.yaduo.com/atourlife";

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

const buildAtourHeaders = (token) => ({
  Accept: "*/*",
  "At-Platform-Type": env.atourPlatformType,
  "At-Client-Id": env.atourClientId,
  "At-App-Version": env.atourAppVersion,
  "Content-Type": "application/json",
  "User-Agent": env.atourUserAgent,
  "At-Access-Token": token,
  "At-Channel-Id": env.atourChannelId,
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

export const calculateOrderV2 = async ({ token, payload, proxy }) => {
  const query = buildAtourQuery(token);
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/order/calculateOrderV2?${query}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {}),
    timeoutMs: 12000
  }, proxy);
  const data = await parseAtourResponse(response, "calculateOrderV2 failed");
  if (!data?.result || (typeof data.result === "object" && Object.keys(data.result).length === 0)) {
    throw new Error(`calculateOrderV2 returned empty result (retcode=${data?.retcode ?? "unknown"} retmsg=${data?.retmsg || ""})`);
  }
  return data.result || {};
};

export const addAppOrder = async ({ token, payload, proxy }) => {
  const query = buildAtourQuery(token);
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/order/addAppOrder?${query}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {}),
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

  const payload = new URLSearchParams({
    channelId: String(env.atourChannelId),
    activitySource: "",
    activeId: "",
    platType: String(env.atourPlatformType),
    r: String(Math.random()),
    token: String(token),
    chainId: String(chainId),
    folioId: String(folioId),
    appVer: String(env.atourAppVersion)
  });

  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/order/getOrderDetail`, {
    method: "POST",
    headers: {
      ...buildAtourHeaders(token),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString(),
    timeoutMs: 12000
  }, proxy);

  const data = await parseAtourResponse(response, "getOrderDetail failed");
  return data.result || {};
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

const buildCalculatePayloadFromItem = ({ order, item, customerName, customerPhone }) => {
  const resolvedRpActivityId = item.rpActivityId || item.rateCodeId;
  if (!item.rateCode || !resolvedRpActivityId || !item.roomTypeId) {
    throw new Error("missing rateCode/rpActivityId(room rate id)/roomTypeId on order item");
  }
  const start = toAtourDate(item.checkInDate);
  const end = toAtourDate(item.checkOutDate);
  return {
    accommodationType: "",
    accommodationCount: "",
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

const buildAddOrderPayloadFromItem = ({ calculateResult, calculatePayload, customerName, customerPhone, orderItem, coupons }) => {
  const itemRemark = orderItem?.remark ? String(orderItem.remark) : "";
  const breakfastCount = Math.max(0, Number(orderItem?.breakfastCount) || 0);
  const roomLevelUpCount = Math.max(0, Number(orderItem?.roomLevelUpCount) || 0);
  const delayedCheckOutCount = Math.max(0, Number(orderItem?.delayedCheckOutCount) || 0);
  const shooseCount = Math.max(0, Number(orderItem?.shooseCount) || 0);

  return {
    inactiveId: "", // 发票信息id
    activeId: "",
    repeatToken: String(calculateResult.repeatToken || ""),

    invoiceId: "",
    invoiceType: "",
    invoiceEmail: "",
    invoiceRemark: "",

    remark: itemRemark,
    mergeInvoice: "",
    rateCode: calculatePayload.rateCode,
    rateCodePriceType: String(calculateResult.rateCodePriceType || calculatePayload.rateCodePriceType || "2"),
    roomCount: calculatePayload.roomCount,
    recipientsMobile: "",
    start: calculatePayload.start,
    recipientsName: "",
    customerNeedList: [],
    expectArrivalTime: "",
    getType: "0",
    rpActivityId: calculatePayload.rpActivityId,
    checkInPersons: customerName || "",
    isPointPayAppChannel: "1",
    end: calculatePayload.end,
    breakfastCount,
    roomLevelUpCount,
    delayedCheckOutCount,
    shooseCount,
    coupons: String(coupons || ""),
    delegatorId: "",
    mailAddr: "",
    orderAmount: Number(calculateResult.defaultAmount || calculateResult.amount || 0),
    roomTypeId: Number(calculatePayload.roomTypeId),
    mobile: customerPhone || "",
    customerNeeds: [],
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
    ...buildAddOrderPayloadFromItem({
      calculateResult,
      calculatePayload,
      customerName: createPayload.customerName,
      customerPhone: createPayload.customerPhone,
      orderItem: createPayload.orderItem || null,
      coupons: couponCodes
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

  const bookingChannel = parseBookingTier(item.bookingTier || undefined);
  const minCouponWallet = {
    breakfast: Math.max(0, Number(item.breakfastCount) || 0),
    upgrade: Math.max(0, Number(item.roomLevelUpCount) || 0),
    lateCheckout: Math.max(0, Number(item.delayedCheckOutCount) || 0),
    slippers: Math.max(0, Number(item.shooseCount) || 0)
  };
  const resourceCtx = await getInternalRequestContext({
    tier: bookingChannel.tier,
    corporateName: bookingChannel.corporateName,
    preferredAccountId: item.accountId || undefined,
    minDailyOrdersLeft: item.accountId ? 0 : 1,
    minCouponWallet
  });
  if (!resourceCtx.token) {
    throw new Error("余额不足：该下单渠道暂无可用账号");
  }
  if (!resourceCtx.proxy) {
    throw new Error("暂无可用代理节点");
  }

  // TODO: 如果当前账号 dailyOrdersLeft 不足，后续应自动拆单并继续路由到下一可用账号。

  const calculatePayload = buildCalculatePayloadFromItem({
    order,
    item,
    customerName: order.customerName,
    customerPhone: order.contactPhone
  });

  if (bookingChannel.tier === "NEW_USER") {
    await runNewGuestIdentityUpdate({
      token: resourceCtx.token,
      proxy: resourceCtx.proxy,
      chainId: order.chainId,
      realName: order.customerName || "刘三"
    });
  }

  const scanAccountId = resourceCtx.tokenAccountId || item.accountId || null;
  if (scanAccountId) {
    await runCouponScanTask({
      payload: { accountId: scanAccountId, chainId: order.chainId },
      proxy: resourceCtx.proxy
    }).catch(() => undefined);
  }

  const workflow = await runAtourOrderWorkflow({
    token: resourceCtx.token,
    proxy: resourceCtx.proxy,
    calculatePayload: {
      ...calculatePayload,
      createPayload: {
        customerName: order.customerName,
        customerPhone: item.accountPhone,
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
    accountId: resourceCtx.tokenAccountId || item.accountId || null,
    accountPhone: resourceCtx.tokenAccountPhone || item.accountPhone || null,
    status: "CONFIRMED",
    executionStatus: "ORDERED"
  });
  await prismaStore.refreshOrderStatus(item.groupId);

  if (scanAccountId) {
    await runCouponScanTask({
      payload: { accountId: scanAccountId, chainId: order.chainId },
      proxy: resourceCtx.proxy
    }).catch(() => undefined);
  }

  return {
    tokenSource: resourceCtx.tokenSource,
    tokenAccountId: resourceCtx.tokenAccountId,
    proxyId: resourceCtx.proxy?.id || null,
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

  const order = await prismaStore.getOrder(item.groupId);
  if (!order) {
    throw new Error("order not found");
  }

  const bookingChannel = parseBookingTier(item.bookingTier || undefined);
  const resourceCtx = await getInternalRequestContext({
    tier: bookingChannel.tier,
    corporateName: bookingChannel.corporateName,
    preferredAccountId: item.accountId || undefined,
    minDailyOrdersLeft: 0
  });
  if (!resourceCtx.token) {
    throw new Error("No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN.");
  }
  if (!resourceCtx.proxy) {
    throw new Error("暂无可用代理节点");
  }

  const payOrderResult = await createPayOrder({
    token: resourceCtx.token,
    proxy: resourceCtx.proxy,
    payload: {
      chainId: String(order.chainId),
      source: "order",
      orderNo: item.atourOrderId,
      busType: "room_order"
    }
  });

  const cashierInformation = await getCashierInformation({
    token: resourceCtx.token,
    proxy: resourceCtx.proxy,
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
      token: resourceCtx.token,
      proxy: resourceCtx.proxy,
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
    tokenSource: resourceCtx.tokenSource,
    tokenAccountId: resourceCtx.tokenAccountId,
    proxyId: resourceCtx.proxy?.id || null,
    raw: {
      payOrderResult,
      cashierInformation,
      payData
    }
  };
};
