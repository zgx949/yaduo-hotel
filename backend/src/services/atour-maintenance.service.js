import { env } from "../config/env.js";
import { prismaStore } from "../data/prisma-store.js";
import { fetchWithProxy } from "./proxied-fetch.service.js";

const nowIso = () => new Date().toISOString();

const buildAtourHeaders = (token, contentType = "application/json") => ({
  Accept: "*/*",
  "At-Platform-Type": env.atourPlatformType,
  "At-Client-Id": env.atourClientId,
  "At-App-Version": env.atourAppVersion,
  "Content-Type": contentType,
  "User-Agent": env.atourUserAgent,
  "At-Access-Token": token,
  "At-Channel-Id": env.atourChannelId,
  ...(env.atourCookie ? { Cookie: env.atourCookie } : {})
});

const buildProxyParam = (proxy) => {
  if (!proxy?.host || !proxy?.port) {
    return "";
  }
  const host = String(proxy.host).trim();
  const port = Number(proxy.port);
  if (!host || !port) {
    return "";
  }
  if (proxy.authEnabled && proxy.authUsername) {
    const user = encodeURIComponent(String(proxy.authUsername));
    const pass = encodeURIComponent(String(proxy.authPassword || ""));
    return `http://${user}:${pass}@${host}:${port}`;
  }
  return `http://${host}:${port}`;
};

const parseJsonSafe = async (response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const resolveTargets = async ({ accountId, requireOnline }) => {
  if (accountId) {
    const target = await prismaStore.getPoolAccountCredential(accountId);
    if (!target) {
      return [];
    }
    const onlineOk = !requireOnline || target.account?.is_online;
    if (!target.account?.is_enabled || !onlineOk) {
      return [];
    }
    return target.token ? [target] : [];
  }

  const list = await prismaStore.listPoolAccountCredentials({
    is_enabled: true,
    ...(requireOnline ? { is_online: true } : {})
  });
  return list.filter((it) => Boolean(it.token));
};

const writeTaskResult = async ({ account, taskKey, message, patch = {} }) => {
  await prismaStore.updatePoolAccount(account.id, {
    ...patch,
    lastExecution: { [taskKey]: nowIso() },
    lastResult: { [taskKey]: message }
  });
};

const fetchMarketingData = async ({ token, proxy }) => {
  const params = new URLSearchParams({
    platType: env.atourPlatformType,
    appVer: env.atourAppVersion,
    token: String(token),
    channelId: String(env.atourChannelId)
  });
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/member/queryMarketingDataV2?${params.toString()}`, {
    method: "GET",
    headers: buildAtourHeaders(token),
    timeoutMs: 12000
  }, proxy);
  const data = await parseJsonSafe(response);
  return {
    ok: response.ok && Number(data?.retcode) === 0,
    data
  };
};

const fetchCouponWallet = async ({ token, proxy }) => {
  const body = new URLSearchParams({
    channelId: String(env.atourChannelId),
    activitySource: "",
    activeId: "",
    platType: String(env.atourPlatformType),
    r: String(Math.random()),
    token: String(token),
    type: "4",
    state: "2",
    appVer: String(env.atourAppVersion)
  });

  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/coupon/memberCouponList`, {
    method: "POST",
    headers: buildAtourHeaders(token, "application/x-www-form-urlencoded"),
    body: body.toString(),
    timeoutMs: 12000
  }, proxy);
  const data = await parseJsonSafe(response);
  return {
    ok: response.ok && Number(data?.retcode) === 0,
    data
  };
};

const queryAllDiscountCouponAssets = async ({ token, proxy }) => {
  const appVer = process.env.ATOUR_COUPON_ASSET_APP_VER || "4.8.0";
  const deviceId = process.env.ATOUR_COUPON_ASSET_DEVICE_ID || env.atourClientId;
  const base = process.env.ATOUR_COUPON_ASSET_BASE_URL || "https://miniapp.yaduo.com";
  const params = new URLSearchParams({
    appVer,
    version: appVer,
    channelId: String(env.atourChannelId),
    deviceId: String(deviceId),
    token: String(token),
    inactiveId: "",
    clientId: process.env.ATOUR_COUPON_ASSET_CLIENT_ID || "6",
    elementId: "0",
    traceId: "0",
    activeId: "0",
    activityId: "0",
    activitySource: "",
    osversion: process.env.ATOUR_COUPON_ASSET_OS_VERSION || "iOS",
    devbrand: process.env.ATOUR_COUPON_ASSET_BRAND || "iPhone",
    devmodel: process.env.ATOUR_COUPON_ASSET_MODEL || "iPhone",
    browser: "0.0.0",
    brversion: "0.0.0",
    platType: String(env.atourPlatformType),
    "At-Platform-Type": String(env.atourPlatformType)
  });

  const response = await fetchWithProxy(`${base}/atourlife/coupon/memberCouponListOfType?${params.toString()}`, {
    method: "POST",
    headers: {
      ...buildAtourHeaders(token),
      Host: "miniapp.yaduo.com",
      Origin: "https://mobile.yaduo.com",
      Referer: "https://mobile.yaduo.com/",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      titleCode: "DISCOUNT_COUPON",
      sortScene: "",
      stateCodes: ["AVAILABLE"],
      token: String(token)
    }),
    timeoutMs: 12000
  }, proxy);

  const data = await parseJsonSafe(response);
  if (!response.ok || Number(data?.retcode) !== 0) {
    throw new Error(data?.retmsg || "查询账号优惠券资产失败");
  }
  const couponList = Array.isArray(data?.result?.couponList) ? data.result.couponList : [];
  return couponList.map((it) => ({
    code: String(it?.code || ""),
    discountId: it?.discountId,
    couponDesc: String(it?.couponDesc || ""),
    valueDesc: String(it?.valueDesc || ""),
    expiryStr: String(it?.expiryStr || ""),
    expiryTip: String(it?.expiryTip || ""),
    couponState: String(it?.couponState || ""),
    discountRule: String(it?.discountRule || "")
  })).filter((it) => Boolean(it.code));
};

const listOrderDiscountCoupons = async ({
  token,
  proxy,
  chainId,
  rpActivityId,
  startDate,
  endDate,
  defaultAmount,
  roomTypeId
}) => {
  if (!chainId || !rpActivityId || !startDate || !endDate || !roomTypeId) {
    return [];
  }
  const body = new URLSearchParams({
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
    defaultAmount: String(defaultAmount || 0),
    roomTypeId: String(roomTypeId),
    appVer: String(env.atourAppVersion)
  });
  const response = await fetchWithProxy(`${env.atourOrderApiBaseUrl}/coupon/getMebDiscountCouponsListByChainNew`, {
    method: "POST",
    headers: buildAtourHeaders(token, "application/x-www-form-urlencoded"),
    body: body.toString(),
    timeoutMs: 12000
  }, proxy);
  const data = await parseJsonSafe(response);
  if (!response.ok || Number(data?.retcode) !== 0) {
    return [];
  }
  return Array.isArray(data?.result?.discountCouponList) ? data.result.discountCouponList : [];
};

const runSigninViaGateway = async ({ token, proxy }) => {
  const proxyParam = buildProxyParam(proxy);
  const captchaBase = process.env.ATOUR_CAPTCHA_API_BASE_URL || "http://81.68.144.211:5050/getvalidate/jy4";
  const captchaId = process.env.ATOUR_CAPTCHA_ID || "051dd44e2973389d1d3a0755bd70d757";
  const captchaUrl = new URL(captchaBase);
  captchaUrl.searchParams.set("captcha_id", captchaId);
  if (proxyParam) {
    captchaUrl.searchParams.set("proxy", proxyParam);
  }

  const captchaRes = await fetch(captchaUrl.toString(), { method: "GET" });
  const captchaData = await parseJsonSafe(captchaRes);
  const sec = captchaData?.seccode || {};
  if (!sec?.lot_number || !sec?.pass_token || !sec?.gen_time || !sec?.captcha_output) {
    throw new Error("签到验证码获取失败");
  }

  const signBase = process.env.ATOUR_TASK_API_BASE_URL || "http://81.68.144.211:5002/yaduoapi";
  const signUrl = new URL(`${signBase}/daily_signin`);
  signUrl.searchParams.set("token", String(token));
  signUrl.searchParams.set("lot_number", String(sec.lot_number));
  signUrl.searchParams.set("pass_token", String(sec.pass_token));
  signUrl.searchParams.set("gen_time", String(sec.gen_time));
  signUrl.searchParams.set("captcha_output", String(sec.captcha_output));
  if (proxyParam) {
    signUrl.searchParams.set("proxies", proxyParam);
  }

  const signRes = await fetch(signUrl.toString(), { method: "GET" });
  const signData = await parseJsonSafe(signRes);
  return signData;
};

const runLotteryViaGateway = async ({ token, proxy }) => {
  const proxyParam = buildProxyParam(proxy);
  const base = process.env.ATOUR_TASK_API_BASE_URL || "http://81.68.144.211:5002/yaduoapi";
  const url = new URL(`${base}/daily_raffle`);
  url.searchParams.set("token", String(token));
  if (proxyParam) {
    url.searchParams.set("proxies", proxyParam);
  }
  const res = await fetch(url.toString(), { method: "GET" });
  return parseJsonSafe(res);
};

const summarizeCouponCounts = (resultList = []) => {
  const summary = { breakfast: 0, upgrade: 0, lateCheckout: 0, slippers: 0 };
  for (const it of resultList) {
    const disType = Number(it?.disType);
    const cnt = Number(it?.memberCount) || 0;
    if (disType === 40) summary.breakfast = cnt;
    if (disType === 39) summary.upgrade = cnt;
    if (disType === 41) summary.lateCheckout = cnt;
    if (disType === 42) summary.slippers = cnt;
  }
  return summary;
};

export const runTokenRefreshTask = async ({ payload = {}, proxy }) => {
  const targets = await resolveTargets({ accountId: payload.accountId, requireOnline: false });
  const results = [];

  for (const target of targets) {
    const { account, token } = target;
    try {
      const check = await fetchMarketingData({ token, proxy });
      if (!check.ok) {
        await writeTaskResult({
          account,
          taskKey: "refresh",
          message: "token无效或已过期",
          patch: { is_online: false }
        });
        results.push({ accountId: account.id, ok: false, message: "token invalid" });
        continue;
      }

      const points = Number(check?.data?.result?.pointMallCard?.pointNum) || 0;
      await writeTaskResult({
        account,
        taskKey: "refresh",
        message: `token有效，积分 ${points}`,
        patch: { is_online: true, points }
      });
      results.push({ accountId: account.id, ok: true, points });
    } catch (err) {
      await writeTaskResult({
        account,
        taskKey: "refresh",
        message: `巡检失败: ${err?.message || "unknown"}`
      });
      results.push({ accountId: account.id, ok: false, message: err?.message || "failed" });
    }
  }

  return { ok: true, total: targets.length, results };
};

export const runPointsScanTask = async ({ payload = {}, proxy }) => {
  const targets = await resolveTargets({ accountId: payload.accountId, requireOnline: true });
  const results = [];

  for (const target of targets) {
    const { account, token } = target;
    try {
      const check = await fetchMarketingData({ token, proxy });
      if (!check.ok) {
        await writeTaskResult({
          account,
          taskKey: "pointsScan",
          message: "积分扫描失败（token失效）",
          patch: { is_online: false }
        });
        results.push({ accountId: account.id, ok: false, message: "token invalid" });
        continue;
      }

      const points = Number(check?.data?.result?.pointMallCard?.pointNum) || 0;
      await writeTaskResult({
        account,
        taskKey: "pointsScan",
        message: `积分同步完成：${points}`,
        patch: { points }
      });
      results.push({ accountId: account.id, ok: true, points });
    } catch (err) {
      await writeTaskResult({
        account,
        taskKey: "pointsScan",
        message: `积分扫描失败: ${err?.message || "unknown"}`
      });
      results.push({ accountId: account.id, ok: false, message: err?.message || "failed" });
    }
  }

  return { ok: true, total: targets.length, results };
};

export const runCouponScanTask = async ({ payload = {}, proxy }) => {
  const targets = await resolveTargets({ accountId: payload.accountId, requireOnline: true });
  const results = [];

  for (const target of targets) {
    const { account, token } = target;
    try {
      const resolvedChainId = payload.chainId
        ? String(payload.chainId)
        : await prismaStore.getLatestChainIdByAccount(account.id);

      const res = await fetchCouponWallet({ token, proxy });
      const retcode = Number(res?.data?.retcode);
      if (!res.ok && retcode === 10002) {
        await writeTaskResult({
          account,
          taskKey: "scan",
          message: "优惠券扫描失败（账号离线）",
          patch: { is_online: false }
        });
        results.push({ accountId: account.id, ok: false, message: "offline" });
        continue;
      }
      if (!res.ok) {
        throw new Error(res?.data?.retmsg || "coupon scan failed");
      }

      const summary = summarizeCouponCounts(Array.isArray(res?.data?.result) ? res.data.result : []);
      const discountCouponAssets = await queryAllDiscountCouponAssets({ token, proxy }).catch(() => []);
      const discountCouponCount = discountCouponAssets.length;

      await writeTaskResult({
        account,
        taskKey: "scan",
        message: `礼遇券同步（早${summary.breakfast}/升${summary.upgrade}/延${summary.lateCheckout}/鞋${summary.slippers}）；满减优惠券资产 ${discountCouponCount} 张`,
        patch: {
          breakfast_coupons: summary.breakfast,
          room_upgrade_coupons: summary.upgrade,
          late_checkout_coupons: summary.lateCheckout,
          slippers_coupons: summary.slippers,
          discount_coupon_assets: discountCouponAssets,
          lastResult: {
            couponAssets: {
              discountCoupons: discountCouponCount,
              chainId: resolvedChainId || null,
              details: discountCouponAssets,
              scannedAt: nowIso()
            }
          }
        }
      });
      results.push({
        accountId: account.id,
        ok: true,
        chainId: resolvedChainId || null,
        discountCoupons: discountCouponCount,
        discountCouponAssets,
        ...summary
      });
    } catch (err) {
      await writeTaskResult({
        account,
        taskKey: "scan",
        message: `礼遇券扫描失败: ${err?.message || "unknown"}`
      });
      results.push({ accountId: account.id, ok: false, message: err?.message || "failed" });
    }
  }

  return { ok: true, total: targets.length, results };
};

export const runDailyCheckinTask = async ({ payload = {}, proxy }) => {
  const targets = await resolveTargets({ accountId: payload.accountId, requireOnline: true });
  const results = [];

  for (const target of targets) {
    const { account, token } = target;
    try {
      const data = await runSigninViaGateway({ token, proxy });
      const retcode = Number(data?.data?.retcode);
      const retmsg = String(data?.data?.retmsg || "");
      const debrisDesc = String(data?.data?.result?.debrisDesc || "");

      if (retcode === 0) {
        await writeTaskResult({
          account,
          taskKey: "checkIn",
          message: debrisDesc || "签到成功"
        });
        results.push({ accountId: account.id, ok: true, message: debrisDesc || "ok" });
        continue;
      }

      if (retcode === 1000) {
        await writeTaskResult({
          account,
          taskKey: "checkIn",
          message: retmsg || "今天已签到"
        });
        results.push({ accountId: account.id, ok: true, message: retmsg || "already" });
        continue;
      }

      throw new Error(retmsg || "签到失败");
    } catch (err) {
      await writeTaskResult({
        account,
        taskKey: "checkIn",
        message: `签到失败: ${err?.message || "unknown"}`
      });
      results.push({ accountId: account.id, ok: false, message: err?.message || "failed" });
    }
  }

  return { ok: true, total: targets.length, results };
};

export const runDailyLotteryTask = async ({ payload = {}, proxy }) => {
  const targets = await resolveTargets({ accountId: payload.accountId, requireOnline: true });
  const results = [];

  for (const target of targets) {
    const { account, token } = target;
    try {
      const data = await runLotteryViaGateway({ token, proxy });
      const items = Array.isArray(data?.data) ? data.data : [];
      const latest = items.length > 0 ? items[items.length - 1] : null;
      const message = latest
        ? `抽奖结果：${String(latest.name || "未知奖励")} x${Number(latest.num) || 1}`
        : "抽奖完成，未命中奖励";

      await writeTaskResult({ account, taskKey: "lottery", message });
      results.push({ accountId: account.id, ok: true, message, latest });
    } catch (err) {
      await writeTaskResult({
        account,
        taskKey: "lottery",
        message: `抽奖失败: ${err?.message || "unknown"}`
      });
      results.push({ accountId: account.id, ok: false, message: err?.message || "failed" });
    }
  }

  return { ok: true, total: targets.length, results };
};
