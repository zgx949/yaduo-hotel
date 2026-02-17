import { randomUUID } from "node:crypto";
import { Router } from "express";
import { env } from "../config/env.js";
import { store } from "../data/store.js";
import { requireAuth } from "../middleware/auth.js";

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

hotelsRoutes.post("/search", requireAuth, async (req, res) => {
  // TODO: 从数据库随机取一个在线的token
  if (!env.atourAccessToken) {
    return res.status(400).json({ message: "ATOUR_ACCESS_TOKEN is missing in backend env" });
  }

  const {
    city = "",
    keyword = "",
    checkIn,
    checkOut,
    pageNo = 1,
    cacheKey = ""
  } = req.body || {};

  const startDate = checkIn || new Date().toISOString().slice(0, 10);
  const endDate =
    checkOut || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const requestPayload = {
    model: {
      startDate,
      endDate,
      longitude: "0",
      latitude: "0",
      cityName: "",
      locationType: 1,
      distanceCode: "",
      order: 1,
      locationLongitude: "0",
      tagCodeList: [],
      searchWord: keyword || city || "",
      locationLatitude: "0",
      brandList: [],
      locationCityName: city || "",
      newPoiIdList: [],
      poiId: 0,
      pageNo,
      searchType: 0,
      cacheKey
    },
    header: {}
  };

  const headers = {
    "At-Client-Id": env.atourClientId,
    "At-Access-Token": env.atourAccessToken,
    "At-Platform-Type": env.atourPlatformType,
    "At-Channel-Id": env.atourChannelId,
    "At-App-Version": env.atourAppVersion,
    "User-Agent": env.atourUserAgent,
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    ...(env.atourMebId ? { mebId: env.atourMebId } : {}),
    ...(env.atourCookie ? { Cookie: env.atourCookie } : {})
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch("https://user-gateway.yaduo.com/api/product/search/chain", {
      method: "POST",
      headers,
      body: JSON.stringify(requestPayload),
      signal: controller.signal
    });

    const raw = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        message: raw?.message || raw?.msg || "Atour search request failed"
      });
    }

    const items = normalizeHotels(raw);
    return res.json({
      items,
      page: {
        pageNo: raw?.data?.pageNo,
        hasNext: Boolean(raw?.data?.hasNext),
        cacheKey: raw?.data?.cacheKey || ""
      },
      meta: {
        success: raw?.success,
        code: raw?.code,
        msgCode: raw?.msg_code
      }
    });
  } catch (err) {
    return res.status(502).json({
      message: err.name === "AbortError" ? "Atour search timeout" : "Atour search failed"
    });
  } finally {
    clearTimeout(timeout);
  }
});
