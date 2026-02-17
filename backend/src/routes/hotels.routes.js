import { randomUUID } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";
import { getInternalRequestContext } from "../services/internal-resource.service.js";

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

const normalizeHotels = (raw) => {
  const list = raw?.data?.chainListResponseList;
  if (!Array.isArray(list)) {
    return [];
  }

  return list.map((item) => {
    const chainId = String(item.chainId || "");
    const hotelName = String(item.name || "未命名酒店");
    const risk = store.checkBlacklistedHotel(chainId, hotelName);

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
  });
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
  if (rateName.includes("铂金") || rateName.includes("白金")) {
    return "PLATINUM";
  }
  return "NORMAL";
};

const normalizeChainDetail = (raw, fallback = {}) => {
  const result = raw?.result || {};
  const priceResponse = result.priceResponse || {};
  const roomList = Array.isArray(priceResponse.chainRoomList) ? priceResponse.chainRoomList : [];
  const chainId = String(priceResponse.chainId || fallback.chainId || "");
  const name = String(result.chainName || priceResponse.chainName || fallback.name || "未命名酒店");
  const risk = store.checkBlacklistedHotel(chainId, name);

  const rooms = roomList.map((roomItem, index) => {
    const roomInfo = roomItem.roomTypeInfoResponse || {};
    const infoList = Array.isArray(roomInfo.infoList) ? roomInfo.infoList : [];
    const roomRates = Array.isArray(roomItem.roomPriceList) ? roomItem.roomPriceList : [];
    const fallbackRate = roomItem.minRoomPrice ? [roomItem.minRoomPrice] : [];
    const rateSource = roomRates.length > 0 ? roomRates : fallbackRate;

    const rates = rateSource
      .map((rateItem, rateIdx) => {
        const price = toNumber(rateItem.priceOfDiscount, NaN) || toNumber(rateItem.showPriceV2, NaN) || toNumber(rateItem.showPrice, NaN) || toNumber(rateItem.price, NaN);
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
          originalPrice: toNumber(rateItem.marketPrice, undefined),
          type: detectRateType(rateItem),
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
  const resourceCtx = getInternalRequestContext();
  if (!resourceCtx.token) {
    return res.status(400).json({ message: "No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN." });
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
    token: resourceCtx.token,
    version: "2.0"
  });

  const headers = {
    Accept: "*/*",
    "User-Agent": "AtourLife/4.1.0 (iPhone; iOS 18.4.1; Scale/3.00)",
    "Accept-Language": "zh-Hans-CN;q=1",
    ...(env.atourCookie ? { Cookie: env.atourCookie } : {})
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${env.atourPlaceSearchBaseUrl}?${query.toString()}`, {
      method: "GET",
      headers,
      signal: controller.signal
    });

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
        tokenSource: resourceCtx.tokenSource,
        tokenAccountId: resourceCtx.tokenAccountId,
        proxyId: resourceCtx.proxy?.id || null
      }
    });
  } catch (err) {
    return res.status(502).json({
      message: err.name === "AbortError" ? "Atour place search timeout" : "Atour place search failed"
    });
  } finally {
    clearTimeout(timeout);
  }
});


hotelsRoutes.post("/detail", requireAuth, async (req, res) => {
  const resourceCtx = getInternalRequestContext();
  if (!resourceCtx.token) {
    return res.status(400).json({ message: "No available token. Please configure pool account token or ATOUR_ACCESS_TOKEN." });
  }

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
  const finishDate =
    endDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const query = new URLSearchParams({
    platType: env.atourPlatformType,
    appVer: env.atourAppVersion,
    inactiveId: "",
    channelId: env.atourChannelId,
    token: resourceCtx.token,
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
    "At-Access-Token": resourceCtx.token,
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${atourApiOrigin}/atourlife/chain/chainDetailQuote?${query.toString()}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const raw = await response.json();
    if (!response.ok || raw?.retcode !== 0) {
      return res.status(response.ok ? 502 : response.status).json({
        message: raw?.retmsg || "Atour detail request failed"
      });
    }

    const hotel = normalizeChainDetail(raw, {
      chainId: hotelChainId,
      name,
      address,
      cityName
    });

    if (!hotel.rooms.length) {
      return res.status(502).json({ message: "酒店详情返回无可预订房型，请稍后重试" });
    }

    return res.json({
      hotel,
      meta: {
        retcode: raw?.retcode,
        retmsg: raw?.retmsg,
        tokenSource: resourceCtx.tokenSource,
        tokenAccountId: resourceCtx.tokenAccountId,
        proxyId: resourceCtx.proxy?.id || null
      }
    });
  } catch (err) {
    return res.status(502).json({
      message: err.name === "AbortError" ? "Atour detail timeout" : "Atour detail request failed"
    });
  } finally {
    clearTimeout(timeout);
  }
});
