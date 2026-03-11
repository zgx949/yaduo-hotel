import { randomUUID } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { prismaStore } from "../data/prisma-store.js";
import { requireAuth } from "../middleware/auth.js";
import { buildSearchChannelsForUser } from "../services/booking-channel.service.js";
import { getInternalRequestContext } from "../services/internal-resource.service.js";
import { fetchWithProxy } from "../services/proxied-fetch.service.js";

export const hotelsRoutes = Router();

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
};

const flattenTagMap = (tagResponseMap) => {
  if (!tagResponseMap || typeof tagResponseMap !== "object") {
    return [];
  }
  const list = [];
  Object.values(tagResponseMap).forEach((arr) => {
    if (!Array.isArray(arr)) {
      return;
    }
    arr.forEach((tag) => {
      if (tag?.tagName) {
        list.push(String(tag.tagName));
      }
    });
  });
  return list;
};

const buildFallbackRooms = (chainItem) => {
  const price =
    toNumber(chainItem.priceWithCoupon, NaN) ||
    toNumber(chainItem.showPrice, NaN) ||
    toNumber(chainItem.showPriceV2, NaN) ||
    0;

  const rateTags = Array.isArray(chainItem.discountTextsV2)
    ? chainItem.discountTextsV2
    : Array.isArray(chainItem.discountTexts)
      ? chainItem.discountTexts
      : [];

  return [
    {
      id: `room-${chainItem.chainId || randomUUID()}`,
      name: "标准房型",
      image: chainItem.image || chainItem.images?.[0] || "",
      size: "--",
      bed: "--",
      window: "--",
      tags: [],
      rates: [
        {
          id: `rate-${chainItem.chainId || randomUUID()}`,
          name: chainItem.rateCodeName || "标准预订",
          price,
          originalPrice: toNumber(chainItem.marketPrice, undefined),
          type: "NORMAL",
          tags: rateTags
        }
      ]
    }
  ];
};

const normalizeHotels = async (raw) => {
  const list = raw?.data?.chainListResponseList;
  if (!Array.isArray(list)) {
    return [];
  }

  const hotels = await Promise.all(list.map(async (item) => {
    const chainId = String(item.chainId || "");
    const hotelName = String(item.name || "未命名酒店");
    const risk = await prismaStore.checkBlacklistedHotel(chainId, hotelName);

    return {
      id: chainId || randomUUID(),
      chainId,
      name: hotelName,
      location: item.chainArea || item.cityName || "",
      address: item.address || "",
      score: toNumber(item.judgementScore, 0),
      reviews: toNumber(item.judgementCount, 0),
      image: item.image || item.images?.[0] || "",
      tags: Array.from(
        new Set([
          ...flattenTagMap(item.tagResponseMap),
          ...(Array.isArray(item.priceTag) ? item.priceTag : []),
          ...(Array.isArray(item.discountTextsV2) ? item.discountTextsV2 : [])
        ].filter(Boolean))
      ),
      minPrice:
        toNumber(item.priceWithCoupon, NaN) ||
        toNumber(item.showPrice, NaN) ||
        toNumber(item.showPriceV2, NaN) ||
        0,
      rooms: buildFallbackRooms(item),
      blacklistCount: risk.count || 0
    };
  }));

  return hotels;
};

const normalizePlaces = (raw) => {
  const list = raw?.result?.currentCity;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((item) => ({
    id: `${item.type || "x"}-${item.chainId || item.poiId || item.title || randomUUID()}`,
    type: Number(item.type ?? -1),
    chainId: item.chainId ? String(item.chainId) : null,
    title: String(item.title || ""),
    subTitle: String(item.subTitle || ""),
    cityName: String(item.cityName || ""),
    address: String(item.address || ""),
    latitude: item.location?.latitude ?? null,
    longitude: item.location?.longitude ?? null
  }));
};

const pickRandomChannelsByTier = (channels = []) => {
  const groups = new Map();
  for (const channel of channels) {
    const key = String(channel?.tier || "NORMAL");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(channel);
  }

  const picked = [];
  for (const bucket of groups.values()) {
    if (!Array.isArray(bucket) || bucket.length === 0) {
      continue;
    }
    const randomIndex = Math.floor(Math.random() * bucket.length);
    picked.push(bucket[randomIndex]);
  }
  return picked;
};

const atourApiOrigin = (() => {
  try {
    return new URL(env.atourPlaceSearchBaseUrl).origin;
  } catch {
    return "https://api2.yaduo.com";
  }
})();

const detectRateType = (rateItem = {}) => {
  if (rateItem.corpPrice) {
    return "CORPORATE";
  }
  if (rateItem.newGuestDiscountFlag) {
    return "NEW_USER";
  }
  const rateName = String(rateItem.rateCodeName || "");
  if (rateName.includes("铂金")) {
    return "PLATINUM";
  }
  return "NORMAL";
};

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

const runNewUserPopupCheck = async ({ token, proxy, chainId }) => {
  const params = new URLSearchParams({
    token: String(token),
    platType: String(env.atourPlatformType),
    appVer: String(env.atourAppVersion),
    channelId: String(env.atourChannelId),
    activitySource: "",
    activityId: "",
    activeId: ""
  });

  const headers = {
    Accept: "application/json, text/plain, */*",
    "At-Platform-Type": env.atourPlatformType,
    "At-Client-Id": env.atourClientId,
    "At-App-Version": env.atourAppVersion,
    "Content-Type": "application/json",
    "User-Agent": env.atourUserAgent,
    "At-Access-Token": token,
    "At-Channel-Id": env.atourChannelId,
    ...(env.atourCookie ? { Cookie: env.atourCookie } : {})
  };

  const body = {
    docType: 1,
    realName: "刘三",
    idCardNumber: buildMockIdCardNumber(),
    chainId: String(chainId)
  };

  const response = await fetchWithProxy(`${atourApiOrigin}/atourlife/chain/newGuestIdentityCheck?${params.toString()}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    timeoutMs: 10000
  }, proxy);

  const raw = await response.json().catch(() => ({}));
  if (!response.ok || raw?.retcode !== 0) {
    throw new Error(raw?.retmsg || "newGuestIdentityCheck failed");
  }

  const warning = Boolean(raw?.result);
  return {
    status: warning ? "ALERT" : "CLEAR",
    warning,
    message: warning ? "检测到新客下单弹窗风险" : "未检测到新客下单弹窗"
  };
};

const normalizeChainDetail = async (raw, fallback = {}, sourceMeta = {}) => {
  const result = raw?.result || {};
  const priceResponse = result.priceResponse || {};
  const roomList = Array.isArray(priceResponse.chainRoomList) ? priceResponse.chainRoomList : [];
  const chainId = String(priceResponse.chainId || fallback.chainId || "");
  const name = String(result.chainName || priceResponse.chainName || fallback.name || "未命名酒店");
  const risk = await prismaStore.checkBlacklistedHotel(chainId, name);

  const rooms = roomList.map((roomItem, index) => {
    const roomInfo = roomItem.roomTypeInfoResponse || {};
    const infoList = Array.isArray(roomInfo.infoList) ? roomInfo.infoList : [];
    const roomRates = Array.isArray(roomItem.roomPriceList) ? roomItem.roomPriceList : [];
    const fallbackRate = roomItem.minRoomPrice ? [roomItem.minRoomPrice] : [];
    const rateSource = roomRates.length > 0 ? roomRates : fallbackRate;

    const rates = rateSource
      .map((rateItem, rateIdx) => {
        // const price = toNumber(rateItem.priceOfDiscount, NaN) || toNumber(rateItem.showPriceV2, NaN) || toNumber(rateItem.showPrice, NaN) || toNumber(rateItem.price, NaN);
        const price = toNumber(rateItem.showPriceV2, NaN) || toNumber(rateItem.showPrice, NaN) || toNumber(rateItem.price, NaN);
        if (!price) {
          return null;
        }
        const discountTexts = Array.from(
          new Set([
            ...(Array.isArray(rateItem.discountTexts) ? rateItem.discountTexts : []),
            ...(Array.isArray(rateItem.discountTextsV2) ? rateItem.discountTextsV2 : [])
          ].map((it) => String(it || "").trim()).filter(Boolean))
        );
        const tags = Array.isArray(rateItem.tags)
          ? rateItem.tags.map((tag) => String(tag?.tagName || tag || "").trim()).filter(Boolean)
          : [];
        const mergedTags = Array.from(new Set([...tags, ...discountTexts]));
        return {
          id: `${roomInfo.roomTypeId || `room-${index}`}-rate-${rateItem.rateCodeId || rateIdx}`,
          name: String(rateItem.rateCodeName || "标准预订"),
          price,
          rateCode: String(rateItem.rateCode || "").trim() || undefined,
          rateCodeId: String(rateItem.rateCodeId || rateItem.rpActivityId || "").trim() || undefined,
          rpActivityId: String(rateItem.rpActivityId || rateItem.rateCodeId || "").trim() || undefined,
          rateCodePriceType: String(rateItem.rateCodePriceType || "").trim() || undefined,
          rateCodeActivities: String(rateItem.rateCodeActivities || "").trim() || undefined,
          roomTypeId: String(roomInfo.roomTypeId || "").trim() || undefined,
          originalPrice: toNumber(rateItem.marketPrice, undefined),
          type: sourceMeta?.tier || detectRateType(rateItem),
          channelKey: sourceMeta?.channelKey || detectRateType(rateItem),
          channelLabel: sourceMeta?.label || sourceMeta?.channelKey || detectRateType(rateItem),
          sourceAccountId: sourceMeta?.tokenAccountId || null,
          newUserPopupStatus: sourceMeta?.newUserPopupStatus || "NONE",
          newUserPopupWarning: Boolean(sourceMeta?.newUserPopupWarning),
          tags: mergedTags,
          stock: toNumber(rateItem.leftRoomNum, NaN) || toNumber(rateItem.roomNum, NaN) || undefined,
          cancelTips: String(rateItem.cancelTips || "").trim() || undefined,
          bookNotice: String(rateItem.bookNotice || "").trim() || undefined,
          rewardPointText: String(rateItem.rewardPointText || "").trim() || undefined,
          breakfastCount: toNumber(rateItem.breakFastNum, NaN) || 0,
          discountTexts
        };
      })
      .filter(Boolean);

    return {
      id: String(roomInfo.roomTypeId || `room-${index}`),
      name: String(roomInfo.roomTypeName || `房型${index + 1}`),
      image: roomInfo.imageList?.[0] || "",
      size: String(infoList[0] || "--"),
      bed: String(infoList[1] || "--"),
      window: String(infoList[2] || "--"),
      tags: Array.from(
        new Set([
          ...(Array.isArray(roomInfo.roomLabel) ? roomInfo.roomLabel : []),
          ...(Array.isArray(roomInfo.roomServerLabel) ? roomInfo.roomServerLabel : [])
        ].map((it) => String(it)).filter(Boolean))
      ),
      stock:
        toNumber(roomItem?.minRoomPrice?.leftRoomNum, NaN) ||
        toNumber(roomItem?.minRoomPrice?.roomNum, NaN) ||
        undefined,
      rates
    };
  }).filter((room) => room.rates.length > 0);

  const minPrice = rooms.length > 0
    ? Math.min(...rooms.map((room) => Math.min(...room.rates.map((rate) => rate.price))))
    : 0;

  return {
    id: chainId || randomUUID(),
    chainId,
    name,
    location: String(result?.topJudgement?.experienceText || fallback.cityName || ""),
    address: String(result.chainAddress || fallback.address || ""),
    score: toNumber(result?.topJudgement?.judgementScore, 0),
    reviews: toNumber(result?.topJudgement?.judgementCount, 0),
    image: result.chainMainPic || rooms[0]?.image || "",
    tags: Array.isArray(result.chainSparkleList)
      ? result.chainSparkleList.map((it) => String(it?.name || "")).filter(Boolean)
      : [],
    minPrice,
    rooms,
    blacklistCount: risk.count || 0
  };
};

hotelsRoutes.get("/place-search", requireAuth, async (req, res) => {
  const proxy = await prismaStore.acquireProxyNode();
  if (!proxy) {
    return res.status(400).json({ message: "No available proxy from proxy pool." });
  }

  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.json({ items: [] });
  }

  const currentCityName = String(req.query.currentCityName || "").trim();

  const query = new URLSearchParams({
    "At-App-Version": env.atourAppVersion,
    "At-Channel-Id": env.atourChannelId,
    "At-Client-Id": env.atourPlaceSearchClientId,
    "At-Platform-Type": env.atourPlatformType,
    activeId: "",
    activitySource: "",
    appVer: env.atourAppVersion,
    channelId: env.atourChannelId,
    currentCityName,
    deviceId: env.atourPlaceSearchClientId,
    inactiveId: "",
    keyWord: keyword,
    latitude: "",
    longitude: "",
    platType: env.atourPlatformType,
    version: "2.0"
  });

  if (env.atourAccessToken) {
    query.set("token", String(env.atourAccessToken));
  }

  const headers = {
    Accept: "*/*",
    "User-Agent": "AtourLife/4.1.0 (iPhone; iOS 18.4.1; Scale/3.00)",
    "Accept-Language": "zh-Hans-CN;q=1",
    ...(env.atourCookie ? { Cookie: env.atourCookie } : {})
  };

  try {
    const response = await fetchWithProxy(`${env.atourPlaceSearchBaseUrl}?${query.toString()}`, {
      method: "GET",
      headers,
      timeoutMs: 12000
    }, proxy);

    const raw = await response.json();
    if (!response.ok || raw?.retcode !== 0) {
      return res.status(response.ok ? 502 : response.status).json({
        message: raw?.retmsg || "Atour place search failed"
      });
    }

    const items = normalizePlaces(raw);
    return res.json({
      items,
      hotels: items.filter((it) => it.type === 0 && it.chainId),
      meta: {
        retcode: raw?.retcode,
        retmsg: raw?.retmsg,
        tokenSource: env.atourAccessToken ? "env" : "none",
        tokenAccountId: null,
        proxyId: proxy?.id || null
      }
    });
  } catch (err) {
    return res.status(502).json({
      message: err.name === "AbortError" ? "Atour place search timeout" : "Atour place search failed"
    });
  }
});


hotelsRoutes.post("/detail", requireAuth, async (req, res) => {
  const {
    chainId = "",
    beginDate,
    endDate,
    name = "",
    address = "",
    cityName = ""
  } = req.body || {};

  const hotelChainId = String(chainId || "").trim();
  if (!hotelChainId) {
    return res.status(400).json({ message: "chainId is required" });
  }

  const startDate = beginDate || new Date().toISOString().slice(0, 10);
  const finishDate = endDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const systemConfig = await prismaStore.getSystemConfig();
  const candidateChannels = buildSearchChannelsForUser({
    user: req.auth.user,
    systemChannels: systemConfig.channels
  });
  const pickedChannels = pickRandomChannelsByTier(candidateChannels);

  if (pickedChannels.length === 0) {
    return res.status(403).json({ message: "当前账号无可用查询渠道或配额" });
  }

  const channelContexts = await Promise.all(pickedChannels.map(async (channel) => {
    const ctx = await getInternalRequestContext({
      tier: channel.tier,
      corporateName: channel.corporateName || undefined,
      candidateLimit: 80
    });
    if (!ctx.token || !ctx.proxy) {
      return null;
    }
    return {
      ...channel,
      token: ctx.token,
      tokenSource: ctx.tokenSource,
      tokenAccountId: ctx.tokenAccountId,
      proxy: ctx.proxy
    };
  }));

  const runnableChannels = channelContexts.filter(Boolean);
  if (runnableChannels.length === 0) {
    return res.status(502).json({ message: "号池或代理池无可用资源，请稍后重试" });
  }

  const settled = await Promise.allSettled(
    runnableChannels.map(async (channel) => {
      const query = new URLSearchParams({
        platType: env.atourPlatformType,
        appVer: env.atourAppVersion,
        inactiveId: "",
        channelId: env.atourChannelId,
        token: channel.token,
        activitySource: "",
        activeId: ""
      });

      const headers = {
        Accept: "*/*",
        "At-Platform-Type": env.atourPlatformType,
        "At-Client-Id": env.atourClientId,
        "At-App-Version": env.atourAppVersion,
        "Content-Type": "application/json",
        "User-Agent": env.atourUserAgent,
        "At-Access-Token": channel.token,
        "At-Channel-Id": env.atourChannelId,
        ...(env.atourCookie ? { Cookie: env.atourCookie } : {})
      };

      const body = {
        beginDate: startDate,
        endDate: finishDate,
        sortByPriceWithCoupon: 1,
        chainId: hotelChainId,
        delegatorId: "",
        delegatorMebId: "",
        corporationId: ""
      };

      const response = await fetchWithProxy(`${atourApiOrigin}/atourlife/chain/chainDetailQuote?${query.toString()}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        timeoutMs: 12000
      }, channel.proxy);

      const raw = await response.json().catch(() => ({}));
      if (!response.ok || raw?.retcode !== 0) {
        throw new Error(raw?.retmsg || `渠道 ${channel.label} 查询失败`);
      }

      let newUserPopup = {
        status: "NONE",
        warning: false,
        message: ""
      };
      if (channel.tier === "NEW_USER") {
        try {
          newUserPopup = await runNewUserPopupCheck({
            token: channel.token,
            proxy: channel.proxy,
            chainId: hotelChainId
          });
        } catch (err) {
          newUserPopup = {
            status: "UNKNOWN",
            warning: false,
            message: err instanceof Error ? err.message : "新客弹窗检测失败"
          };
        }
      }

      const hotel = await normalizeChainDetail(raw, {
        chainId: hotelChainId,
        name,
        address,
        cityName
      }, {
        tier: channel.tier,
        channelKey: channel.channelKey,
        label: channel.label,
        tokenAccountId: channel.tokenAccountId,
        newUserPopupStatus: newUserPopup.status,
        newUserPopupWarning: newUserPopup.warning
      });

      return {
        channel,
        hotel,
        meta: {
          retcode: raw?.retcode,
          retmsg: raw?.retmsg,
          tokenSource: channel.tokenSource,
          tokenAccountId: channel.tokenAccountId,
          proxyId: channel.proxy?.id || null,
          newUserPopup
        }
      };
    })
  );

  const successList = settled.filter((it) => it.status === "fulfilled").map((it) => it.value);
  const failedList = settled
    .filter((it) => it.status === "rejected")
    .map((it) => ({ message: it.reason?.message || "query failed" }));

  if (successList.length === 0) {
    return res.status(502).json({
      message: "全部渠道查询失败",
      failures: failedList
    });
  }

  const base = successList[0].hotel;
  const roomMap = new Map();
  for (const entry of successList) {
    for (const room of entry.hotel.rooms || []) {
      const roomKey = `${room.id}:${room.name}`;
      if (!roomMap.has(roomKey)) {
        roomMap.set(roomKey, {
          ...room,
          rates: []
        });
      }
      roomMap.get(roomKey).rates.push(...(room.rates || []));
    }
  }

  const mergedRooms = Array.from(roomMap.values())
    .map((room) => {
      room.rates = room.rates
        .filter((rate, index, arr) => {
          const key = `${rate.channelKey}:${rate.rateCodeId || rate.rpActivityId || rate.id}`;
          return arr.findIndex((x) => `${x.channelKey}:${x.rateCodeId || x.rpActivityId || x.id}` === key) === index;
        })
        .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
      return room;
    })
    .filter((room) => room.rates.length > 0)
    .sort((a, b) => Number(a.rates[0]?.price || Infinity) - Number(b.rates[0]?.price || Infinity));

  const mergedHotel = {
    ...base,
    minPrice: mergedRooms.length > 0 ? Math.min(...mergedRooms.map((room) => Number(room.rates[0]?.price || Infinity))) : 0,
    rooms: mergedRooms,
    newUserPopupStatus: "NONE",
    newUserPopupWarning: false,
    newUserPopupMessage: ""
  };

  const newUserMetas = successList
    .filter((it) => it.channel.tier === "NEW_USER")
    .map((it) => it.meta.newUserPopup)
    .filter(Boolean);
  if (newUserMetas.some((it) => it.status === "ALERT")) {
    mergedHotel.newUserPopupStatus = "ALERT";
    mergedHotel.newUserPopupWarning = true;
    mergedHotel.newUserPopupMessage = "该酒店新用户下单可能触发弹窗，请谨慎操作";
  } else if (newUserMetas.some((it) => it.status === "CLEAR")) {
    mergedHotel.newUserPopupStatus = "CLEAR";
    mergedHotel.newUserPopupWarning = false;
    mergedHotel.newUserPopupMessage = "新用户下单未检测到弹窗";
  } else if (newUserMetas.length > 0) {
    mergedHotel.newUserPopupStatus = "UNKNOWN";
    mergedHotel.newUserPopupWarning = false;
    mergedHotel.newUserPopupMessage = "新用户弹窗检测失败，结果不确定";
  }

  return res.json({
    hotel: mergedHotel,
    meta: {
      channelsTried: runnableChannels.map((it) => it.channelKey),
      channelsSuccess: successList.map((it) => it.channel.channelKey),
      partialFailures: failedList,
      channelDetails: successList.map((it) => ({
        channelKey: it.channel.channelKey,
        tokenSource: it.meta.tokenSource,
        tokenAccountId: it.meta.tokenAccountId,
        proxyId: it.meta.proxyId,
        newUserPopup: it.meta.newUserPopup
      })),
      newUserPopupStatus: mergedHotel.newUserPopupStatus,
      newUserPopupWarning: mergedHotel.newUserPopupWarning,
      newUserPopupMessage: mergedHotel.newUserPopupMessage
    }
  });
});
