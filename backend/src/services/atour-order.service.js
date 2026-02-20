import { env } from "../config/env.js";
import { prismaStore } from "../data/prisma-store.js";
import { getInternalRequestContext } from "./internal-resource.service.js";

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

export const calculateOrderV2 = async ({ token, payload }) => {
  const query = buildAtourQuery(token);
  const response = await fetch(`${env.atourOrderApiBaseUrl}/order/calculateOrderV2?${query}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {})
  });
  const data = await parseAtourResponse(response, "calculateOrderV2 failed");
  if (!data?.result || (typeof data.result === "object" && Object.keys(data.result).length === 0)) {
    throw new Error(`calculateOrderV2 returned empty result (retcode=${data?.retcode ?? "unknown"} retmsg=${data?.retmsg || ""})`);
  }
  return data.result || {};
};

export const addAppOrder = async ({ token, payload }) => {
  const query = buildAtourQuery(token);
  const response = await fetch(`${env.atourOrderApiBaseUrl}/order/addAppOrder?${query}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {})
  });
  const data = await parseAtourResponse(response, "addAppOrder failed");
  return data.result || {};
};

export const createPayOrder = async ({ token, payload }) => {
  const query = buildAtourQuery(token);
  const response = await fetch(`${env.atourOrderApiBaseUrl}/pay/createPayOrder?${query}`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {})
  });
  const data = await parseAtourResponse(response, "createPayOrder failed");
  return data.result || {};
};

export const getCashierInformation = async ({ token, payload }) => {
  const response = await fetch(`${env.atourUserGatewayBaseUrl}/api/cash/atour-cash-ser/cashier/information`, {
    method: "POST",
    headers: buildAtourHeaders(token),
    body: JSON.stringify(payload || {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.respCode !== "SUCCESS") {
    throw new Error(data?.respDesc || "cashier information failed");
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

const buildAddOrderPayloadFromItem = ({ calculateResult, calculatePayload, customerName, customerPhone }) => {
  return {
    inactiveId: "",
    activeId: "",
    repeatToken: String(calculateResult.repeatToken || ""),
    invoiceType: "",
    remark: "",
    mergeInvoice: "",
    rateCode: calculatePayload.rateCode,
    invoiceEmail: "",
    rateCodePriceType: String(calculateResult.rateCodePriceType || calculatePayload.rateCodePriceType || "2"),
    roomCount: calculatePayload.roomCount,
    recipientsMobile: "",
    start: calculatePayload.start,
    recipientsName: "",
    customerNeedList: [],
    expectArrivalTime: "",
    getType: "0",
    invoiceRemark: "",
    rpActivityId: calculatePayload.rpActivityId,
    checkInPersons: customerName || "",
    isPointPayAppChannel: "1",
    end: calculatePayload.end,
    breakfastCount: 0,
    roomLevelUpCount: 0,
    delayedCheckOutCount: 0,
    shooseCount: 0,
    delegatorId: "",
    invoiceId: "",
    orderAmount: Number(calculateResult.defaultAmount || calculateResult.amount || 0),
    mailAddr: "",
    roomTypeId: Number(calculatePayload.roomTypeId),
    mobile: customerPhone || "",
    coupons: "",
    customerNeeds: [],
    chainId: Number(calculatePayload.chainId),
    rateCodeActivities: calculatePayload.rateCodeActivities || ""
  };
};

export const runAtourOrderWorkflow = async ({ token, calculatePayload }) => {
  const calculateResult = await calculateOrderV2({ token, payload: calculatePayload });
  const createPayload = calculatePayload.createPayload || {};
  const addPayload = {
    ...buildAddOrderPayloadFromItem({
      calculateResult,
      calculatePayload,
      customerName: createPayload.customerName,
      customerPhone: createPayload.customerPhone
    }),
    ...(createPayload.overrideAddPayload || {})
  };
  const addResult = await addAppOrder({ token, payload: addPayload });
  const payOrderPayload = {
    chainId: String(calculatePayload.chainId),
    source: "order",
    orderNo: addResult.orderId,
    busType: "room_order",
    ...(createPayload.overridePayOrderPayload || {})
  };
  const payOrderResult = await createPayOrder({ token, payload: payOrderPayload });
  const cashierPayload = {
    appFlag: "1",
    reqSeqId: String(Date.now()),
    appVersion: "1.0.3",
    token: payOrderResult.token,
    payTermType: "APP",
    ...(createPayload.overrideCashierPayload || {})
  };
  const cashierInformation = await getCashierInformation({ token, payload: cashierPayload });

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

  const resourceCtx = await getInternalRequestContext({ tier: item.bookingTier || undefined });
  if (!resourceCtx.token) {
    throw new Error("No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN.");
  }

  const calculatePayload = buildCalculatePayloadFromItem({
    order,
    item,
    customerName: order.customerName,
    customerPhone: order.contactPhone
  });
  const workflow = await runAtourOrderWorkflow({
    token: resourceCtx.token,
    calculatePayload: {
      ...calculatePayload,
      createPayload: {
        customerName: order.customerName,
        customerPhone: order.contactPhone
      }
    }
  });

  await prismaStore.updateOrderItem(orderItemId, {
    atourOrderId: workflow.addResult.orderId ? String(workflow.addResult.orderId) : null,
    status: "CONFIRMED",
    executionStatus: "ORDERED"
  });
  await prismaStore.refreshOrderStatus(item.groupId);

  return {
    tokenSource: resourceCtx.tokenSource,
    tokenAccountId: resourceCtx.tokenAccountId,
    proxyId: resourceCtx.proxy?.id || null,
    ...workflow
  };
};
