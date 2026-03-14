import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { otaPrismaStore } from "../data/ota-prisma-store.js";
import { prismaStore } from "../data/prisma-store.js";
import { getInternalRequestContext } from "./internal-resource.service.js";
import { taobaoTopAdapter } from "./ota/taobao-top.adapter.js";
import { fetchWithProxy } from "./proxied-fetch.service.js";

const ADAPTERS = {
  FLIGGY: taobaoTopAdapter
};

const normalizePlatform = (value = "FLIGGY") => String(value || "FLIGGY").trim().toUpperCase();

const normalizeDateText = (value) => {
  const parsed = new Date(String(value || "").trim());
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
};

const normalizeDateTimeText = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mi = String(parsed.getMinutes()).padStart(2, "0");
  const ss = String(parsed.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

const getAdapter = (platform = "FLIGGY") => {
  const normalized = normalizePlatform(platform);
  const adapter = ADAPTERS[normalized];
  if (!adapter) {
    throw new Error(`unsupported ota platform: ${normalized}`);
  }
  return { platform: normalized, adapter };
};

const resolveInboundOrderSubmitPolicy = ({ roomMapping, channelMapping }) => {
  if (roomMapping?.enabled === false) {
    return {
      orderSubmitMode: "MANUAL",
      autoSubmit: false
    };
  }
  const mode = String(roomMapping?.orderSubmitMode || "MANUAL").trim().toUpperCase();
  const roomAutoEnabled = roomMapping?.autoOrderEnabled !== false;
  const channelAutoEnabled = channelMapping?.autoSubmit === true;

  if (mode === "AUTO") {
    return {
      orderSubmitMode: "AUTO",
      autoSubmit: roomAutoEnabled || channelAutoEnabled
    };
  }
  return {
    orderSubmitMode: "MANUAL",
    autoSubmit: false
  };
};

const verifyWebhookSignature = ({ rawBody = "", signature = "", secret = "" }) => {
  const secretText = String(secret || "").trim();
  if (!secretText) {
    return false;
  }
  const digest = createHmac("sha256", secretText).update(String(rawBody || "")).digest("hex");
  const incoming = String(signature || "").trim();
  if (!incoming || incoming.length !== digest.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(digest), Buffer.from(incoming));
};

const sanitizeInboundOrder = (item = {}, includeRaw = false) => {
  if (includeRaw) {
    return { ...item, rawPayload: item.rawPayload || {} };
  }
  const { rawPayload, ...rest } = item;
  return rest;
};

const normalizeCustomerName = (raw = {}) => {
  if (Array.isArray(raw.guests) && raw.guests.length > 0) {
    return String(raw.guests[0] || "").trim();
  }
  if (typeof raw.guests === "string" && raw.guests.trim()) {
    return raw.guests.trim();
  }
  return String(raw.buyer_nick || raw.customer_name || "").trim();
};

const toIntegerAmount = (value) => {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return 0;
  }
  return Math.max(0, Math.round(num));
};

const resolveRackPrice = (roomItem = {}) => {
  const prices = Array.isArray(roomItem.roomPriceList) ? roomItem.roomPriceList : [];
  if (prices.length === 0) {
    const min = roomItem?.minRoomPrice || {};
    return {
      rackPrice: Number(min.marketPrice || min.showPriceV2 || min.showPrice || min.price || min.priceOfDiscount || 0) || 0,
      inventory: Math.max(0, Number(min.leftRoomNum || min.roomNum || 0) || 0)
    };
  }
  const first = prices[0] || {};
  const rackPrice = Number(first.marketPrice || first.showPriceV2 || first.showPrice || first.priceOfDiscount || first.price || 0) || 0;
  const inventory = Math.max(0, Number(first.leftRoomNum || first.roomNum || roomItem?.minRoomPrice?.leftRoomNum || 0) || 0);
  return {
    rackPrice,
    inventory
  };
};

const applyFormulaPrice = ({ rackPrice = 0, multiplier = 1, addend = 0 }) => {
  const finalValue = Math.floor((Number(rackPrice) || 0) * (Number(multiplier) || 1) + (Number(addend) || 0));
  return Math.max(0, finalValue);
};

const buildAtourApiOrigin = () => {
  try {
    return new URL(env.atourPlaceSearchBaseUrl).origin;
  } catch {
    return "https://api2.yaduo.com";
  }
};

function addOneDay(dateText) {
  const base = new Date(`${String(dateText || "").trim()}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) {
    return "";
  }
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

const fetchAtourHotelDetailForDate = async ({ chainId, date, tokenContext }) => {
  const ctx = tokenContext || await getInternalRequestContext({
    candidateLimit: 1,
    allowEnvFallback: true
  });
  if (!ctx.token) {
    throw new Error("no atour token for rack-rate sync");
  }

  const query = new URLSearchParams({
    platType: env.atourPlatformType,
    appVer: env.atourAppVersion,
    inactiveId: "",
    channelId: env.atourChannelId,
    token: String(ctx.token),
    activitySource: "",
    activeId: ""
  });
  const endDate = addOneDay(date);
  const response = await fetchWithProxy(`${buildAtourApiOrigin()}/atourlife/chain/chainDetailQuote?${query.toString()}`, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "At-Platform-Type": env.atourPlatformType,
      "At-Client-Id": env.atourClientId,
      "At-App-Version": env.atourAppVersion,
      "Content-Type": "application/json",
      "User-Agent": env.atourUserAgent,
      "At-Access-Token": ctx.token,
      "At-Channel-Id": env.atourChannelId,
      ...(env.atourCookie ? { Cookie: env.atourCookie } : {})
    },
    body: JSON.stringify({
      beginDate: date,
      endDate: endDate,
      sortByPriceWithCoupon: 1,
      chainId: String(chainId),
      delegatorId: "",
      delegatorMebId: "",
      corporationId: ""
    }),
    timeoutMs: 12000
  }, ctx.proxy || null);

  const raw = await response.json().catch(() => ({}));
  if (!response.ok || Number(raw?.retcode) !== 0) {
    throw new Error(raw?.retmsg || "query chainDetailQuote failed");
  }
  const roomList = Array.isArray(raw?.result?.priceResponse?.chainRoomList)
    ? raw.result.priceResponse.chainRoomList
    : [];
  return roomList;
};

const buildOrderPayloadFromTop = (order = {}) => {
  const externalOrderId = String(order.out_oid || order.outOid || order.oid || order.tid || order.order_id || "").trim();
  const platformHotelId = String(order.hid || order.hotel_id || order.hotelid || "").trim();
  const platformRoomTypeId = String(order.rid || order.out_rid || order.room_type_id || "").trim();
  const platformChannel = String(order.channel || order.source || "DEFAULT").trim().toUpperCase() || "DEFAULT";

  return {
    externalOrderId,
    status: String(order.trade_status || order.status || "NEW").trim().toUpperCase() || "NEW",
    platformHotelId,
    platformRoomTypeId,
    platformChannel,
    customerName: normalizeCustomerName(order) || "OTA客户",
    contactPhone: String(order.mobile || order.contact_phone || "").trim() || null,
    checkInDate: normalizeDateText(order.checkin_date || order.check_in || order.arrival_date),
    checkOutDate: normalizeDateText(order.checkout_date || order.check_out || order.departure_date),
    roomCount: Math.max(1, Number(order.room_count || order.room_num || 1) || 1),
    amount: toIntegerAmount(order.total_price || order.payment || order.price || 0),
    currency: String(order.currency || "CNY").trim().toUpperCase() || "CNY",
    remark: String(order.message || order.remark || "").trim() || null,
    rawPayload: order
  };
};

const buildDefaultTemplatePayload = ({ inboundOrder, hotelMapping, roomMapping, channelMapping }) => {
  const checkInDate = normalizeDateText(inboundOrder.checkInDate);
  const checkOutDate = normalizeDateText(inboundOrder.checkOutDate);

  return {
    hotelName: hotelMapping?.internalHotelName || inboundOrder.platformHotelId,
    customerName: inboundOrder.customerName || "OTA客户",
    chainId: hotelMapping?.internalChainId || "UNKNOWN",
    checkInDate,
    checkOutDate,
    contactPhone: inboundOrder.contactPhone || null,
    currency: inboundOrder.currency || "CNY",
    submitNow: false,
    remark: inboundOrder.remark || `OTA订单 ${inboundOrder.externalOrderId}`,
    splits: [
      {
        bookingTier: roomMapping?.bookingTier || channelMapping?.internalBookingTier || "NORMAL",
        roomTypeId: roomMapping?.internalRoomTypeId || null,
        roomType: roomMapping?.internalRoomTypeName || inboundOrder.platformRoomTypeId,
        roomCount: Math.max(1, Number(inboundOrder.roomCount) || 1),
        amount: Math.max(0, Number(inboundOrder.amount) || 0),
        rateCode: roomMapping?.rateCode || null,
        rateCodeId: roomMapping?.rateCodeId || null,
        rpActivityId: roomMapping?.rpActivityId || null,
        remark: inboundOrder.remark || ""
      }
    ]
  };
};

const getSystemOperator = async () => {
  const admin = await prismaStore.getUserByUsername("admin");
  if (admin) {
    return admin;
  }
  const allUsers = await prismaStore.listUsers();
  if (allUsers.length === 0) {
    throw new Error("no user available to create internal order");
  }
  return allUsers[0];
};

const findHotelMapping = async ({ platform, platformHotelId }) => {
  const mappings = await otaPrismaStore.listHotelMappings({ platform });
  return mappings.find((it) => it.platformHotelId === String(platformHotelId || "")) || null;
};

const enqueueBindingForInboundOrder = async ({ normalizedPlatform, inbound }) => {
  const roomMapping = await otaPrismaStore.getRoomMapping({
    platform: normalizedPlatform,
    platformHotelId: inbound.platformHotelId,
    platformRoomTypeId: inbound.platformRoomTypeId,
    platformChannel: inbound.platformChannel
  });
  const channelMapping = await otaPrismaStore.getChannelMapping({
    platform: normalizedPlatform,
    platformChannel: inbound.platformChannel
  });
  const submitPolicy = resolveInboundOrderSubmitPolicy({ roomMapping, channelMapping });

  const currentBinding = await otaPrismaStore.getOrderBinding({
    platform: normalizedPlatform,
    externalOrderId: inbound.externalOrderId
  });

  if (!currentBinding) {
    await otaPrismaStore.upsertOrderBinding({
      platform: normalizedPlatform,
      externalOrderId: inbound.externalOrderId,
      autoSubmitState: submitPolicy.autoSubmit ? "QUEUED" : "PENDING",
      notes: inbound.alreadyExists ? "duplicate order" : "new inbound order"
    });
  }

  const latestBinding = await otaPrismaStore.getOrderBinding({
    platform: normalizedPlatform,
    externalOrderId: inbound.externalOrderId
  });

  return {
    platform: normalizedPlatform,
    externalOrderId: inbound.externalOrderId,
    alreadyExists: Boolean(inbound.alreadyExists),
    autoSubmit: submitPolicy.autoSubmit,
    orderSubmitMode: submitPolicy.orderSubmitMode,
    hasLocalOrder: Boolean(latestBinding?.localOrderId)
  };
};

export const otaIntegrationService = {
  listPlatforms() {
    return Object.keys(ADAPTERS).map((platform) => ({ platform, enabled: true, mode: "REAL" }));
  },

  async syncPublishedHotels({ platform = "FLIGGY" } = {}) {
    const { platform: normalizedPlatform, adapter } = getAdapter(platform);
    const fetchResult = await adapter.fetchPublishedHotels({
      status: "0",
      pageSize: 50,
      maxPages: 10
    });

    const hotelsById = new Map();
    for (const hotel of fetchResult.hotels || []) {
      const platformHotelId = String(hotel.platformHotelId || "").trim();
      if (!platformHotelId) {
        continue;
      }
      hotelsById.set(platformHotelId, {
        platformHotelId,
        hotelName: String(hotel.hotelName || platformHotelId).trim(),
        city: String(hotel.city || "").trim(),
        status: String(hotel.status || "ONLINE").trim().toUpperCase() || "ONLINE",
        rooms: Array.isArray(hotel.rooms)
          ? hotel.rooms.map((room) => ({
            platformRoomTypeId: String(room.platformRoomTypeId || room.outRid || "").trim(),
            roomTypeName: String(room.roomTypeName || room.platformRoomTypeId || room.outRid || "").trim(),
            bedType: String(room.bedType || "").trim(),
            gid: String(room.gid || "").trim(),
            rpid: String(room.rpid || "").trim(),
            outRid: String(room.outRid || room.platformRoomTypeId || "").trim(),
            rateplanCode: String(room.rateplanCode || "").trim(),
            vendor: String(room.vendor || env.otaTopVendor || "").trim()
          })).filter((room) => room.platformRoomTypeId)
          : []
      });
    }

    const roomMappings = (await otaPrismaStore.listRoomMappings({ platform: normalizedPlatform })).filter((it) => it.enabled !== false);
    for (const mapping of roomMappings) {
      const hotelId = String(mapping.platformHotelId || "").trim();
      if (!hotelId) {
        continue;
      }
      if (!hotelsById.has(hotelId)) {
        hotelsById.set(hotelId, {
          platformHotelId: hotelId,
          hotelName: hotelId,
          city: "",
          status: "ONLINE",
          rooms: []
        });
      }
      const target = hotelsById.get(hotelId);
      const exists = target.rooms.find((room) => room.platformRoomTypeId === mapping.platformRoomTypeId);
      if (!exists) {
        target.rooms.push({
          platformRoomTypeId: mapping.platformRoomTypeId,
          roomTypeName: mapping.platformRoomTypeName || mapping.platformRoomTypeId,
          bedType: "",
          gid: "",
          rpid: "",
          outRid: mapping.platformRoomTypeId,
          rateplanCode: String(mapping.rateCode || "").trim(),
          vendor: String(env.otaTopVendor || "").trim()
        });
      }
    }

    const calendarUpserts = [];
    for (const mapping of roomMappings) {
      const outRid = String(mapping.platformRoomTypeId || "").trim();
      const rateplanCode = String(mapping.rateCode || "").trim();
      if (!outRid || !rateplanCode) {
        continue;
      }
      let rateResult = null;
      try {
        rateResult = await adapter.fetchRate({
          outRid,
          rateplanCode,
          vendor: env.otaTopVendor || undefined
        });
      } catch {
        rateResult = null;
      }

      for (const item of rateResult?.inventoryCalendar || []) {
        const date = normalizeDateText(item.date);
        if (!date) {
          continue;
        }
        calendarUpserts.push({
          platform: normalizedPlatform,
          platformHotelId: mapping.platformHotelId,
          platformRoomTypeId: mapping.platformRoomTypeId,
          platformChannel: String(mapping.platformChannel || "DEFAULT").trim().toUpperCase(),
          rateplanCode,
          date,
          price: toIntegerAmount(item.price),
          inventory: Math.max(0, Number(item.quota || item.inventory || 0) || 0),
          currency: "CNY",
          source: "SYNC"
        });
      }
    }

    const hotels = await otaPrismaStore.upsertPublishedHotels({
      platform: normalizedPlatform,
      hotels: Array.from(hotelsById.values()),
      source: "TOP_SYNC"
    });

    for (const item of calendarUpserts) {
      await otaPrismaStore.upsertCalendarItem(item);
    }

    await otaPrismaStore.appendSyncLog({
      type: "HOTEL_SYNC",
      platform: normalizedPlatform,
      result: {
        count: hotels.length,
        calendarCount: calendarUpserts.length,
        source: fetchResult.source || "TOP_PRODUCT_LIBRARY"
      }
    });

    return {
      platform: normalizedPlatform,
      count: hotels.length,
      hotels,
      calendarCount: calendarUpserts.length
    };
  },

  async listPublishedHotels({ platform } = {}) {
    return otaPrismaStore.listPublishedHotels({ platform: normalizePlatform(platform || "") });
  },

  async upsertHotelProduct({ platform = "FLIGGY", product = {} } = {}) {
    const { platform: normalizedPlatform, adapter } = getAdapter(platform);
    const result = await adapter.fetchHotelByOuterId({
      product: {
        ...product,
        outer_id: product.outer_id || product.outerId || product.platformHotelId,
        vendor: product.vendor || env.otaTopVendor || undefined
      }
    });

    const platformHotelId = String(result.platformHotelId || product.outer_id || product.outerId || "").trim();
    const hotel = result.hotel || {};
    await otaPrismaStore.upsertPublishedHotels({
      platform: normalizedPlatform,
      source: "MANUAL",
      hotels: [
        {
          platformHotelId,
          hotelName: String(hotel.hotelName || product.hotelName || product.name || platformHotelId).trim(),
          city: String(hotel.city || product.city || "").trim(),
          status: String(hotel.status || "OFFLINE").trim().toUpperCase(),
          rawPayload: hotel.rawPayload || result.response || null,
          rooms: []
        }
      ]
    });

    await otaPrismaStore.appendSyncLog({
      type: "PRODUCT_HOTEL_IMPORT_BY_OUTER_ID",
      platform: normalizedPlatform,
      result: {
        platformHotelId,
        status: hotel.status || null,
        isOnline: String(hotel.status || "").toUpperCase() === "ONLINE",
        response: result.response || null
      }
    });

    return {
      platform: normalizedPlatform,
      platformHotelId,
      hotel,
      status: hotel.status || null,
      isOnline: String(hotel.status || "").toUpperCase() === "ONLINE",
      response: result.response || null
    };
  },

  async deleteHotelProduct({ platform = "FLIGGY", product = {} } = {}) {
    const { platform: normalizedPlatform } = getAdapter(platform);

    const platformHotelId = String(
      product.platformHotelId || product.hid || product.hotel_id || product.outer_id || ""
    ).trim();

    if (!platformHotelId) {
      throw new Error("platformHotelId is required");
    }

    const deleted = await otaPrismaStore.deletePublishedHotelLocal({
      platform: normalizedPlatform,
      platformHotelId
    });

    await otaPrismaStore.appendSyncLog({
      type: "PRODUCT_HOTEL_LOCAL_DELETE",
      platform: normalizedPlatform,
      result: {
        platformHotelId,
        deleted
      }
    });

    return {
      platform: normalizedPlatform,
      platformHotelId,
      deleted,
      remoteDeleted: false
    };
  },

  async upsertRoomTypeProduct({ platform = "FLIGGY", product = {} } = {}) {
    const { platform: normalizedPlatform, adapter } = getAdapter(platform);
    const result = await adapter.fetchRoomTypeByOuterId({
      product: {
        ...product,
        hotel_outer_id: product.hotel_outer_id || product.hotelOuterId || product.platformHotelId,
        room_outer_id: product.room_outer_id || product.roomOuterId || product.outer_id || product.out_rid || product.outRid || product.platformRoomTypeId,
        outer_id: product.room_outer_id || product.roomOuterId || product.outer_id || product.out_rid || product.outRid || product.platformRoomTypeId,
        vendor: product.vendor || env.otaTopVendor || undefined
      }
    });

    const platformHotelId = String(
      result.platformHotelId ||
      product.hotel_outer_id ||
      product.hotelOuterId ||
      product.platformHotelId ||
      ""
    ).trim();
    const platformRoomTypeId = String(
      result.platformRoomTypeId ||
      product.room_outer_id ||
      product.roomOuterId ||
      product.outer_id ||
      product.out_rid ||
      product.outRid ||
      ""
    ).trim();
    const room = result.room || {};

    if (!platformHotelId) {
      throw new Error("roomtype fetched but hotel outer_id is missing; please provide hotel outer_id when room outer_id has no hotel prefix");
    }

    const existingHotels = await otaPrismaStore.listPublishedHotels({ platform: normalizedPlatform });
    const existingHotel = existingHotels.find((it) => String(it.platformHotelId || "").trim() === platformHotelId) || null;

    await otaPrismaStore.upsertPublishedHotels({
      platform: normalizedPlatform,
      source: "MANUAL",
      hotels: [
        {
          platformHotelId,
          hotelName: String(existingHotel?.hotelName || product.hotelName || platformHotelId).trim(),
          city: String(existingHotel?.city || product.city || "").trim(),
          status: String(existingHotel?.status || "ONLINE").trim().toUpperCase(),
          rooms: [
            {
              platformRoomTypeId,
              roomTypeName: String(room.roomTypeName || product.roomTypeName || product.name || platformRoomTypeId).trim(),
              bedType: String(room.bedType || product.bedType || product.bed_type || "").trim(),
              area: String(room.area || "").trim(),
              floor: String(room.floor || "").trim(),
              maxOccupancy: Number(room.maxOccupancy || 0) || null,
              windowType: String(room.windowType || "").trim(),
              status: String(room.status || "").trim(),
              gid: String(room.gid || product.gid || "").trim(),
              rpid: String(room.rpid || product.rpid || "").trim(),
              outRid: String(room.outRid || product.outRid || product.out_rid || platformRoomTypeId).trim(),
              rateplanCode: String(room.rateplanCode || product.rateplanCode || product.rateplan_code || "").trim(),
              vendor: String(product.vendor || env.otaTopVendor || "").trim(),
              rawPayload: room.rawPayload || result.response || null
            }
          ]
        }
      ]
    });

    await otaPrismaStore.appendSyncLog({
      type: "PRODUCT_ROOMTYPE_IMPORT_BY_OUTER_ID",
      platform: normalizedPlatform,
      result: {
        platformHotelId,
        platformRoomTypeId,
        roomTypeName: room.roomTypeName || null,
        response: result.response || null
      }
    });

    return {
      platform: normalizedPlatform,
      platformHotelId,
      platformRoomTypeId,
      room,
      response: result.response || null
    };
  },

  async deleteRoomTypeProduct({ platform = "FLIGGY", product = {} } = {}) {
    const { platform: normalizedPlatform, adapter } = getAdapter(platform);
    const result = await adapter.deleteRoomTypeProduct({
      product: {
        ...product,
        outer_id: product.outer_id || product.platformHotelId,
        vendor: product.vendor || env.otaTopVendor || undefined
      }
    });

    if (result.platformHotelId && result.platformRoomTypeId) {
      await otaPrismaStore.deletePublishedRoomType({
        platform: normalizedPlatform,
        platformHotelId: result.platformHotelId,
        platformRoomTypeId: result.platformRoomTypeId
      });
    }

    await otaPrismaStore.appendSyncLog({
      type: "PRODUCT_ROOMTYPE_DELETE",
      platform: normalizedPlatform,
      result: {
        platformHotelId: result.platformHotelId || null,
        platformRoomTypeId: result.platformRoomTypeId || null,
        response: result.response || null
      }
    });

    return {
      platform: normalizedPlatform,
      platformHotelId: result.platformHotelId || null,
      platformRoomTypeId: result.platformRoomTypeId || null,
      response: result.response || null
    };
  },

  async upsertRatePlanProduct({ platform = "FLIGGY", product = {} } = {}) {
    const { platform: normalizedPlatform, adapter } = getAdapter(platform);
    const result = await adapter.fetchRatePlanByCode({
      product: {
        ...product,
        rateplan_code: product.rateplan_code || product.rateplanCode,
        vendor: product.vendor || env.otaTopVendor || undefined
      }
    });

    const platformHotelId = String(product.platformHotelId || product.hotel_outer_id || product.outer_id || "").trim();
    const platformRoomTypeId = String(product.platformRoomTypeId || product.room_outer_id || product.out_rid || product.outRid || "").trim();
    if (!platformHotelId || !platformRoomTypeId) {
      throw new Error("platformHotelId and platformRoomTypeId are required to bind rateplan");
    }

    const fetchedRaw = result?.rateplan?.rawPayload?.rateplan || {};
    const fetchedHid = String(fetchedRaw.hid || fetchedRaw.hotel_id || fetchedRaw.hotelId || "").trim();
    const fetchedOutRid = String(fetchedRaw.out_rid || fetchedRaw.outer_id || fetchedRaw.outRid || fetchedRaw.rid || "").trim();
    if (fetchedOutRid && fetchedOutRid !== platformRoomTypeId) {
      throw new Error(`rateplan_code does not belong to room ${platformRoomTypeId}, fetched out_rid=${fetchedOutRid}`);
    }

    const knownHotels = await otaPrismaStore.listPublishedHotels({ platform: normalizedPlatform });
    const matchedHotel = knownHotels.find((it) => String(it.platformHotelId || "").trim() === platformHotelId) || null;
    const matchedRoom = matchedHotel?.rooms?.find((it) => String(it.platformRoomTypeId || "").trim() === platformRoomTypeId) || null;
    const roomHid = String(matchedRoom?.rawPayload?.hid || "").trim();
    if (fetchedHid && roomHid && fetchedHid !== roomHid) {
      throw new Error(`rateplan_code does not belong to hotel ${platformHotelId}, fetched hid=${fetchedHid}`);
    }

    const persisted = await otaPrismaStore.upsertRoomRatePlan({
      platform: normalizedPlatform,
      platformHotelId,
      platformRoomTypeId,
      rateplan: result.rateplan || {
        rateplanCode: String(product.rateplanCode || product.rateplan_code || "").trim(),
        rateplanName: String(product.rateplanName || product.name || "").trim(),
        rpid: String(product.rpid || "").trim()
      }
    });

    await otaPrismaStore.appendSyncLog({
      type: "PRODUCT_RATEPLAN_IMPORT_BY_CODE",
      platform: normalizedPlatform,
      result: {
        platformHotelId,
        platformRoomTypeId,
        rateplanCode: result.rateplanCode || String(product.rateplanCode || product.rateplan_code || "").trim(),
        response: result.response || null
      }
    });

    return {
      platform: normalizedPlatform,
      platformHotelId,
      platformRoomTypeId,
      rateplanCode: result.rateplanCode || String(product.rateplanCode || product.rateplan_code || "").trim(),
      rateplan: result.rateplan || null,
      roomRateplans: persisted.rateplans || [],
      response: result.response || null
    };
  },

  async deleteRatePlanProduct({ platform = "FLIGGY", product = {} } = {}) {
    const { platform: normalizedPlatform } = getAdapter(platform);
    const platformHotelId = String(product.platformHotelId || product.hotel_outer_id || product.outer_id || "").trim();
    const platformRoomTypeId = String(product.platformRoomTypeId || product.room_outer_id || product.out_rid || product.outRid || "").trim();
    const rateplanCode = String(product.rateplanCode || product.rateplan_code || "").trim();

    if (!platformHotelId || !platformRoomTypeId || !rateplanCode) {
      throw new Error("platformHotelId, platformRoomTypeId and rateplanCode are required");
    }

    const result = await otaPrismaStore.deleteRoomRatePlan({
      platform: normalizedPlatform,
      platformHotelId,
      platformRoomTypeId,
      rateplanCode
    });

    await otaPrismaStore.appendSyncLog({
      type: "PRODUCT_RATEPLAN_LOCAL_DELETE",
      platform: normalizedPlatform,
      result: {
        platformHotelId,
        platformRoomTypeId,
        rateplanCode,
        removed: result.removed,
        remainingCount: Array.isArray(result.rateplans) ? result.rateplans.length : 0
      }
    });

    return {
      platform: normalizedPlatform,
      platformHotelId,
      platformRoomTypeId,
      rateplanCode,
      removed: result.removed,
      roomRateplans: result.rateplans || []
    };
  },

  async deleteRateProduct({ platform = "FLIGGY", product = {} } = {}) {
    const { platform: normalizedPlatform, adapter } = getAdapter(platform);
    const result = await adapter.deleteRateProduct({
      product: {
        ...product,
        vendor: product.vendor || env.otaTopVendor || undefined
      }
    });

    await otaPrismaStore.appendSyncLog({
      type: "PRODUCT_RATE_DELETE",
      platform: normalizedPlatform,
      result: {
        gid: String(product.gid || "").trim() || null,
        rpid: String(product.rpid || "").trim() || null,
        outRid: String(product.outRid || product.out_rid || "").trim() || null,
        rateplanCode: String(product.rateplanCode || product.rateplan_code || "").trim() || null,
        response: result.response || null
      }
    });

    return {
      platform: normalizedPlatform,
      response: result.response || null
    };
  },

  async upsertHotelMapping(payload = {}) {
    return otaPrismaStore.upsertHotelMapping({
      ...payload,
      platform: normalizePlatform(payload.platform || "FLIGGY")
    });
  },

  async listHotelMappings({ platform } = {}) {
    return otaPrismaStore.listHotelMappings({ platform: normalizePlatform(platform || "") });
  },

  async upsertRoomMapping(payload = {}) {
    return otaPrismaStore.upsertRoomMapping({
      ...payload,
      platformChannel: String(payload.platformChannel || "DEFAULT").trim().toUpperCase(),
      orderSubmitMode: String(payload.orderSubmitMode || "MANUAL").trim().toUpperCase(),
      autoOrderEnabled: payload.autoOrderEnabled !== false,
      autoSyncEnabled: payload.autoSyncEnabled !== false,
      manualTuningEnabled: Boolean(payload.manualTuningEnabled),
      autoSyncFutureDays: Math.max(1, Number(payload.autoSyncFutureDays) || 30),
      platform: normalizePlatform(payload.platform || "FLIGGY")
    });
  },

  async listRoomMappings({ platform } = {}) {
    return otaPrismaStore.listRoomMappings({ platform: normalizePlatform(platform || "") });
  },

  async upsertChannelMapping(payload = {}) {
    return otaPrismaStore.upsertChannelMapping({
      ...payload,
      platform: normalizePlatform(payload.platform || "FLIGGY")
    });
  },

  async listChannelMappings({ platform } = {}) {
    return otaPrismaStore.listChannelMappings({ platform: normalizePlatform(platform || "") });
  },

  async setCalendarItems({ platform = "FLIGGY", items = [], source = "manual" } = {}) {
    const normalizedPlatform = normalizePlatform(platform);
    const sourceItems = Array.isArray(items) ? items : [];
    const accepted = [];
    for (const item of sourceItems) {
      const date = normalizeDateText(item.date);
      if (!date) {
        continue;
      }
      const platformHotelId = String(item.platformHotelId || "").trim();
      const platformRoomTypeId = String(item.platformRoomTypeId || "").trim();
      const platformChannel = String(item.platformChannel || "DEFAULT").trim().toUpperCase();
      const rateplanCode = String(item.rateplanCode || item.rateplan_code || "").trim();
      if (!platformHotelId || !platformRoomTypeId) {
        continue;
      }
      if (!rateplanCode) {
        continue;
      }
      const upserted = await otaPrismaStore.upsertCalendarItem({
        platform: normalizedPlatform,
        platformHotelId,
        platformRoomTypeId,
        platformChannel,
        rateplanCode,
        date,
        price: Math.max(0, Number(item.price) || 0),
        inventory: Math.max(0, Number(item.inventory) || 0),
        currency: String(item.currency || "CNY").trim().toUpperCase(),
        source
      });
      accepted.push(upserted);
    }
    return accepted;
  },

  async listCalendarItems(filters = {}) {
    return otaPrismaStore.listCalendarItems({
      platform: normalizePlatform(filters.platform || ""),
      platformHotelId: filters.platformHotelId,
      platformRoomTypeId: filters.platformRoomTypeId,
      platformChannel: filters.platformChannel,
      rateplanCode: filters.rateplanCode,
      startDate: filters.startDate,
      endDate: filters.endDate
    });
  },

  async syncCalendarFromRackRates({
    platform = "FLIGGY",
    date,
    days,
    platformHotelId,
    platformRoomTypeId,
    platformChannel,
    rateplanCode,
    clearOutOfRange = false
  } = {}) {
    const normalizedPlatform = normalizePlatform(platform);
    const startDate = normalizeDateText(date) || new Date().toISOString().slice(0, 10);
    const hasDaysOverride = Number.isFinite(Number(days)) && Number(days) > 0;
    const roomMappings = (await otaPrismaStore.listRoomMappings({
      platform: normalizedPlatform,
      platformHotelId: platformHotelId || undefined,
      platformRoomTypeId: platformRoomTypeId || undefined,
      platformChannel: platformChannel || undefined
    }))
      .filter((it) => it.enabled !== false)
      .filter((it) => !rateplanCode || String(it.rateCode || "").trim() === String(rateplanCode || "").trim());

    const strategyDays = new Map();
    for (const strategy of roomMappings) {
      const key = `${strategy.platformHotelId}::${strategy.platformRoomTypeId}::${String(strategy.platformChannel || "DEFAULT").trim().toUpperCase()}::${String(strategy.rateCode || "").trim()}`;
      const value = hasDaysOverride
        ? Math.max(1, Math.min(180, Number(days) || 1))
        : Math.max(1, Math.min(180, Number(strategy.autoSyncFutureDays || env.otaRackSyncDays || 30) || 30));
      strategyDays.set(key, value);
    }
    const totalDays = Math.max(1, ...Array.from(strategyDays.values()));

    const hotelMappings = (await otaPrismaStore.listHotelMappings({ platform: normalizedPlatform }))
      .filter((it) => it.enabled !== false)
      .filter((it) => !platformHotelId || it.platformHotelId === String(platformHotelId));

    const hotelById = new Map(hotelMappings.map((it) => [String(it.platformHotelId), it]));
    const updatedItems = [];
    const errors = [];
    const tokenContext = await getInternalRequestContext({
      candidateLimit: 1,
      allowEnvFallback: true
    });
    if (!tokenContext.token) {
      throw new Error("no atour token for rack-rate sync");
    }

    for (let offset = 0; offset < totalDays; offset += 1) {
      const dayDate = new Date(`${startDate}T00:00:00.000Z`);
      dayDate.setUTCDate(dayDate.getUTCDate() + offset);
      const dayText = dayDate.toISOString().slice(0, 10);

      const byHotel = new Map();
      for (const mapping of roomMappings) {
        const hotelId = String(mapping.platformHotelId || "").trim();
        if (!hotelId) {
          continue;
        }
        if (!byHotel.has(hotelId)) {
          byHotel.set(hotelId, []);
        }
        byHotel.get(hotelId).push(mapping);
      }

      for (const [hotelId, mappings] of byHotel.entries()) {
        const hotelBinding = hotelById.get(hotelId);
        const chainId = String(hotelBinding?.internalChainId || "").trim();
        if (!chainId) {
          errors.push({ hotelId, date: dayText, message: "missing internalChainId mapping" });
          continue;
        }

        let roomList = [];
        try {
          roomList = await fetchAtourHotelDetailForDate({
            chainId,
            date: dayText,
            tokenContext
          });
        } catch (err) {
          errors.push({
            hotelId,
            date: dayText,
            message: err instanceof Error ? err.message : "query rack failed"
          });
          continue;
        }

        const roomMap = new Map();
        for (const room of roomList) {
          const roomTypeId = String(room?.roomTypeInfoResponse?.roomTypeId || "").trim();
          if (!roomTypeId) {
            continue;
          }
          roomMap.set(roomTypeId, room);
        }

        for (const strategy of mappings) {
          const internalRoomTypeId = String(strategy.internalRoomTypeId || "").trim();
          const roomRaw = roomMap.get(internalRoomTypeId);
          if (!roomRaw) {
            continue;
          }
          const strategyKey = `${strategy.platformHotelId}::${strategy.platformRoomTypeId}::${String(strategy.platformChannel || "DEFAULT").trim().toUpperCase()}::${String(strategy.rateCode || "").trim()}`;
          const allowedDays = Number(strategyDays.get(strategyKey) || 1);
          if (offset >= allowedDays) {
            continue;
          }
          const { rackPrice, inventory } = resolveRackPrice(roomRaw);
          const otaPrice = applyFormulaPrice({
            rackPrice,
            multiplier: Number(strategy.formulaMultiplier ?? 1),
            addend: Number(strategy.formulaAddend ?? 0)
          });
          const upserted = await otaPrismaStore.upsertCalendarItem({
            platform: normalizedPlatform,
            platformHotelId: String(strategy.platformHotelId || "").trim(),
            platformRoomTypeId: String(strategy.platformRoomTypeId || "").trim(),
            platformChannel: String(strategy.platformChannel || "DEFAULT").trim().toUpperCase(),
            rateplanCode: String(strategy.rateCode || "").trim(),
            date: dayText,
            price: otaPrice,
            inventory,
            currency: "CNY",
            source: "RACK_SYNC"
          });
          updatedItems.push(upserted);
        }
      }
    }

    if (clearOutOfRange) {
      for (const strategy of roomMappings) {
        const strategyKey = `${strategy.platformHotelId}::${strategy.platformRoomTypeId}::${String(strategy.platformChannel || "DEFAULT").trim().toUpperCase()}::${String(strategy.rateCode || "").trim()}`;
        const allowedDays = Number(strategyDays.get(strategyKey) || 1);
        const rangeEndDate = new Date(`${startDate}T00:00:00.000Z`);
        rangeEndDate.setUTCDate(rangeEndDate.getUTCDate() + allowedDays - 1);
        const rangeEndText = rangeEndDate.toISOString().slice(0, 10);

        const existing = await otaPrismaStore.listCalendarItems({
          platform: normalizedPlatform,
          platformHotelId: String(strategy.platformHotelId || "").trim(),
          platformRoomTypeId: String(strategy.platformRoomTypeId || "").trim(),
          platformChannel: String(strategy.platformChannel || "DEFAULT").trim().toUpperCase(),
          rateplanCode: String(strategy.rateCode || "").trim()
        });

        for (const item of existing) {
          const dateText = normalizeDateText(item.date);
          if (!dateText) {
            continue;
          }
          if (dateText >= startDate && dateText <= rangeEndText) {
            continue;
          }
          const upserted = await otaPrismaStore.upsertCalendarItem({
            platform: normalizedPlatform,
            platformHotelId: String(strategy.platformHotelId || "").trim(),
            platformRoomTypeId: String(strategy.platformRoomTypeId || "").trim(),
            platformChannel: String(strategy.platformChannel || "DEFAULT").trim().toUpperCase(),
            rateplanCode: String(strategy.rateCode || "").trim(),
            date: dateText,
            price: Math.max(0, Number(item.price) || 0),
            inventory: 0,
            currency: String(item.currency || "CNY").trim().toUpperCase(),
            source: "RACK_SYNC_TRIM"
          });
          updatedItems.push(upserted);
        }
      }
    }

    await otaPrismaStore.appendSyncLog({
      type: "RACK_RATE_SYNC",
      platform: normalizedPlatform,
      result: {
        startDate,
        days: totalDays,
        clearOutOfRange: Boolean(clearOutOfRange),
        updatedCount: updatedItems.length,
        errorCount: errors.length,
        errors
      }
    });

    return {
      platform: normalizedPlatform,
      startDate,
      days: totalDays,
      clearOutOfRange: Boolean(clearOutOfRange),
      updatedCount: updatedItems.length,
      errorCount: errors.length,
      items: updatedItems,
      errors
    };
  },

  async previewRackRateForStrategy({
    platform = "FLIGGY",
    date,
    platformHotelId,
    platformRoomTypeId,
    platformChannel,
    rateplanCode
  } = {}) {
    const normalizedPlatform = normalizePlatform(platform);
    const dayText = normalizeDateText(date) || new Date().toISOString().slice(0, 10);
    const hotelId = String(platformHotelId || "").trim();
    const roomId = String(platformRoomTypeId || "").trim();
    const channel = String(platformChannel || "DEFAULT").trim().toUpperCase();
    const rateCode = String(rateplanCode || "").trim();

    if (!hotelId || !roomId || !rateCode) {
      throw new Error("platformHotelId, platformRoomTypeId, rateplanCode are required");
    }

    const strategy = (await otaPrismaStore.listRoomMappings({
      platform: normalizedPlatform,
      platformHotelId: hotelId,
      platformRoomTypeId: roomId,
      platformChannel: channel
    })).find((it) => String(it.rateCode || "").trim() === rateCode && it.enabled !== false);

    if (!strategy) {
      throw new Error("strategy mapping not found for this room/channel/rateplan");
    }

    const hotelMapping = (await otaPrismaStore.listHotelMappings({ platform: normalizedPlatform }))
      .find((it) => it.platformHotelId === hotelId && it.enabled !== false);
    const chainId = String(hotelMapping?.internalChainId || "").trim();
    if (!chainId) {
      throw new Error("missing internalChainId mapping");
    }

    const tokenContext = await getInternalRequestContext({
      candidateLimit: 1,
      allowEnvFallback: true
    });
    if (!tokenContext.token) {
      throw new Error("no atour token for rack-rate preview");
    }

    const roomList = await fetchAtourHotelDetailForDate({
      chainId,
      date: dayText,
      tokenContext
    });

    const roomRaw = roomList.find((it) => String(it?.roomTypeInfoResponse?.roomTypeId || "").trim() === String(strategy.internalRoomTypeId || "").trim());
    if (!roomRaw) {
      throw new Error("room not found in atour quote result");
    }

    const { rackPrice, inventory } = resolveRackPrice(roomRaw);
    const calculatedPrice = applyFormulaPrice({
      rackPrice,
      multiplier: Number(strategy.formulaMultiplier ?? 1),
      addend: Number(strategy.formulaAddend ?? 0)
    });

    return {
      platform: normalizedPlatform,
      date: dayText,
      platformHotelId: hotelId,
      platformRoomTypeId: roomId,
      platformChannel: channel,
      rateplanCode: rateCode,
      formulaMultiplier: Number(strategy.formulaMultiplier ?? 1),
      formulaAddend: Number(strategy.formulaAddend ?? 0),
      rackPrice,
      inventory,
      calculatedPrice
    };
  },

  async pushRateInventory({ platform = "FLIGGY", items = [] } = {}) {
    const { platform: normalizedPlatform, adapter } = getAdapter(platform);
    const hasExplicitItems = Array.isArray(items) && items.length > 0;
    const allCalendarItems = await otaPrismaStore.listCalendarItems({ platform: normalizedPlatform });
    const sourceItems = hasExplicitItems
      ? items
      : allCalendarItems;

    const roomMappings = await otaPrismaStore.listRoomMappings({ platform: normalizedPlatform });
    const mappingByRoom = new Map(
      roomMappings.map((it) => [
        `${it.platformHotelId}::${it.platformRoomTypeId}::${String(it.platformChannel || "DEFAULT").trim().toUpperCase()}::${String(it.rateCode || "").trim()}`,
        it
      ])
    );

    const prepared = sourceItems
      .map((it) => ({
        platform: normalizedPlatform,
        platformHotelId: String(it.platformHotelId || "").trim(),
        platformRoomTypeId: String(it.platformRoomTypeId || "").trim(),
        date: normalizeDateText(it.date),
        price: Math.max(0, Number(it.price) || 0),
        inventory: Math.max(0, Number(it.inventory) || 0),
        currency: String(it.currency || "CNY").trim().toUpperCase(),
        platformChannel: String(it.platformChannel || "DEFAULT").trim().toUpperCase(),
        rateplanCode: String(it.rateplanCode || it.rateplan_code || "").trim()
      }))
      .filter((it) => {
        if (!it.platformHotelId || !it.platformRoomTypeId || !it.date || !it.rateplanCode) {
          return false;
        }
        const roomMapping = mappingByRoom.get(`${it.platformHotelId}::${it.platformRoomTypeId}::${it.platformChannel}::${it.rateplanCode}`);
        if (!roomMapping?.enabled) {
          return false;
        }
        if (hasExplicitItems) {
          return true;
        }
        if (roomMapping.autoSyncEnabled === false) {
          return false;
        }
        const futureDays = Math.max(1, Number(roomMapping.autoSyncFutureDays) || 30);
        const today = new Date();
        const todayText = today.toISOString().slice(0, 10);
        const end = new Date(new Date(`${todayText}T00:00:00.000Z`).getTime() + futureDays * 24 * 60 * 60 * 1000);
        const day = new Date(`${it.date}T00:00:00.000Z`);
        if (Number.isNaN(day.getTime())) {
          return false;
        }
        return day >= new Date(`${todayText}T00:00:00.000Z`) && day <= end;
      });

    const grouped = new Map();
    for (const item of prepared) {
      const key = `${item.platformHotelId}::${item.platformRoomTypeId}::${item.platformChannel}::${item.rateplanCode}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(item);
    }

    const requestResults = [];
    let rejectedCount = 0;
    const pushedKeys = new Set();

    const allPreparedForMerge = allCalendarItems
      .map((it) => ({
        platform: normalizedPlatform,
        platformHotelId: String(it.platformHotelId || "").trim(),
        platformRoomTypeId: String(it.platformRoomTypeId || "").trim(),
        date: normalizeDateText(it.date),
        price: Math.max(0, Number(it.price) || 0),
        inventory: Math.max(0, Number(it.inventory) || 0),
        currency: String(it.currency || "CNY").trim().toUpperCase(),
        platformChannel: String(it.platformChannel || "DEFAULT").trim().toUpperCase(),
        rateplanCode: String(it.rateplanCode || it.rateplan_code || "").trim()
      }))
      .filter((it) => it.platformHotelId && it.platformRoomTypeId && it.date && it.rateplanCode);

    const existingByStrategy = new Map();
    for (const it of allPreparedForMerge) {
      const key = `${it.platformHotelId}::${it.platformRoomTypeId}::${it.platformChannel}::${it.rateplanCode}`;
      if (!existingByStrategy.has(key)) {
        existingByStrategy.set(key, []);
      }
      existingByStrategy.get(key).push(it);
    }

    for (const [key, groupedItems] of grouped.entries()) {
      const [platformHotelId, platformRoomTypeId, platformChannel, rateplanCode] = key.split("::");
      const roomMapping = mappingByRoom.get(`${platformHotelId}::${platformRoomTypeId}::${platformChannel}::${rateplanCode}`);
      if (!roomMapping) {
        rejectedCount += groupedItems.length;
        continue;
      }
      const outRid = String(roomMapping.platformRoomTypeId || "").trim();
      if (!outRid || !rateplanCode) {
        rejectedCount += groupedItems.length;
        continue;
      }

      const itemsForPush = hasExplicitItems
        ? (() => {
          const merged = new Map();
          for (const oldItem of existingByStrategy.get(key) || []) {
            merged.set(oldItem.date, oldItem);
          }
          for (const newItem of groupedItems) {
            merged.set(newItem.date, newItem);
          }
          return Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
        })()
        : groupedItems;

      if (!Array.isArray(itemsForPush) || itemsForPush.length === 0) {
        rejectedCount += groupedItems.length;
        continue;
      }

      const pushed = await adapter.pushRateInventory({
        outRid,
        rateplanCode,
        vendor: env.otaTopVendor || undefined,
        items: itemsForPush
      });
      for (const item of itemsForPush) {
        pushedKeys.add(`${item.platformHotelId}::${item.platformRoomTypeId}::${item.platformChannel}::${item.rateplanCode}::${item.date}`);
      }
      requestResults.push({
        platformHotelId,
        platformRoomTypeId,
        platformChannel,
        rateplanCode,
        count: itemsForPush.length,
        gidAndRpid: pushed.gidAndRpid || null,
        response: pushed.response || null
      });
    }

    const pushedAt = new Date().toISOString();
    for (const item of prepared) {
      const key = `${item.platformHotelId}::${item.platformRoomTypeId}::${item.platformChannel}::${item.rateplanCode}::${item.date}`;
      if (!pushedKeys.has(key)) {
        continue;
      }
      await otaPrismaStore.upsertCalendarItem({
        ...item,
        source: "PUSH",
        lastPushedAt: pushedAt
      });
    }

    await otaPrismaStore.appendSyncLog({
      type: "RATE_INVENTORY_PUSH",
      platform: normalizedPlatform,
      result: {
        acceptedCount: pushedKeys.size,
        rejectedCount,
        requestResults
      }
    });

    return {
      platform: normalizedPlatform,
      acceptedCount: pushedKeys.size,
      rejectedCount,
      items: prepared.filter((it) => pushedKeys.has(`${it.platformHotelId}::${it.platformRoomTypeId}::${it.platformChannel}::${it.rateplanCode}::${it.date}`)),
      requestResults
    };
  },

  async ingestOrderWebhook({ platform = "FLIGGY", rawBody = "", signature = "", payload = {} } = {}) {
    const normalizedPlatform = normalizePlatform(platform);
    const verified = verifyWebhookSignature({
      rawBody,
      signature,
      secret: env.otaWebhookSecret
    });
    if (!verified) {
      throw new Error("invalid webhook signature");
    }

    const rawOrder = payload?.order || payload;
    const built = buildOrderPayloadFromTop(rawOrder);
    if (!built.externalOrderId) {
      throw new Error("externalOrderId is required");
    }

    const inbound = await otaPrismaStore.upsertInboundOrder({
      platform: normalizedPlatform,
      ...built
    });

    return enqueueBindingForInboundOrder({ normalizedPlatform, inbound });
  },

  async pullInboundOrders({
    platform = "FLIGGY",
    count = 50,
    createdStart,
    createdEnd,
    checkInDateStart,
    checkInDateEnd,
    checkOutDateStart,
    checkOutDateEnd,
    tradeStatus,
    pageNo = 1
  } = {}) {
    const { platform: normalizedPlatform, adapter } = getAdapter(platform);

    const pullResult = await adapter.searchOrders({
      createdStart: createdStart ? normalizeDateTimeText(createdStart) : undefined,
      createdEnd: createdEnd ? normalizeDateTimeText(createdEnd) : undefined,
      checkInDateStart: normalizeDateText(checkInDateStart) || undefined,
      checkInDateEnd: normalizeDateText(checkInDateEnd) || undefined,
      checkOutDateStart: normalizeDateText(checkOutDateStart) || undefined,
      checkOutDateEnd: normalizeDateText(checkOutDateEnd) || undefined,
      tradeStatus: String(tradeStatus || "").trim() || undefined,
      pageNo: Math.max(1, Number(pageNo) || 1)
    });

    const limitedOrders = (pullResult.orders || []).slice(0, Math.max(1, Math.min(200, Number(count) || 50)));
    const items = [];
    for (const row of limitedOrders) {
      const built = buildOrderPayloadFromTop(row);
      if (!built.externalOrderId) {
        continue;
      }
      const inbound = await otaPrismaStore.upsertInboundOrder({
        platform: normalizedPlatform,
        ...built
      });
      const queued = await enqueueBindingForInboundOrder({ normalizedPlatform, inbound });
      items.push(queued);
    }

    await otaPrismaStore.appendSyncLog({
      type: "ORDER_PULL",
      platform: normalizedPlatform,
      result: {
        totalResults: pullResult.totalResults,
        count: items.length,
        pageNo: Math.max(1, Number(pageNo) || 1)
      }
    });

    return {
      platform: normalizedPlatform,
      totalResults: pullResult.totalResults,
      count: items.length,
      items
    };
  },

  async mockPullInboundOrders(params = {}) {
    return this.pullInboundOrders(params);
  },

  async generateOrderTemplate({ platform = "FLIGGY", externalOrderId }) {
    const normalizedPlatform = normalizePlatform(platform);
    const inboundOrder = await otaPrismaStore.getInboundOrder({
      platform: normalizedPlatform,
      externalOrderId
    });
    if (!inboundOrder) {
      throw new Error("inbound ota order not found");
    }

    const hotelMapping = await findHotelMapping({
      platform: normalizedPlatform,
      platformHotelId: inboundOrder.platformHotelId
    });
    const roomMapping = await otaPrismaStore.getRoomMapping({
      platform: normalizedPlatform,
      platformHotelId: inboundOrder.platformHotelId,
      platformRoomTypeId: inboundOrder.platformRoomTypeId,
      platformChannel: inboundOrder.platformChannel
    });
    const channelMapping = await otaPrismaStore.getChannelMapping({
      platform: normalizedPlatform,
      platformChannel: inboundOrder.platformChannel
    });

    const submitPolicy = resolveInboundOrderSubmitPolicy({ roomMapping, channelMapping });
    const templatePayload = buildDefaultTemplatePayload({
      inboundOrder,
      hotelMapping,
      roomMapping,
      channelMapping
    });

    const binding = await otaPrismaStore.upsertOrderBinding({
      platform: normalizedPlatform,
      externalOrderId,
      templatePayload,
      autoSubmitState: submitPolicy.autoSubmit ? "QUEUED" : "PENDING"
    });

    return {
      platform: normalizedPlatform,
      externalOrderId,
      templatePayload,
      binding
    };
  },

  async createInternalOrderFromTemplate({ platform = "FLIGGY", externalOrderId, executeNow = false } = {}) {
    const normalizedPlatform = normalizePlatform(platform);
    let binding = await otaPrismaStore.getOrderBinding({
      platform: normalizedPlatform,
      externalOrderId
    });

    if (!binding?.templatePayload) {
      await this.generateOrderTemplate({
        platform: normalizedPlatform,
        externalOrderId
      });
      binding = await otaPrismaStore.getOrderBinding({
        platform: normalizedPlatform,
        externalOrderId
      });
    }

    if (!binding?.templatePayload) {
      throw new Error("order template not found");
    }

    if (binding.localOrderId) {
      const existing = await prismaStore.getOrder(binding.localOrderId);
      if (existing) {
        return {
          platform: normalizedPlatform,
          externalOrderId,
          localOrderId: existing.id,
          executeNow: false,
          queuedCount: 0,
          order: existing,
          reused: true
        };
      }
    }

    if (binding.autoSubmitState === "SUBMITTING") {
      throw new Error("order creation in progress, please retry later");
    }

    await otaPrismaStore.upsertOrderBinding({
      platform: normalizedPlatform,
      externalOrderId,
      autoSubmitState: "SUBMITTING"
    });

    try {
      const creator = await getSystemOperator();
      const created = await prismaStore.createOrder(binding.templatePayload, creator);

      let latestOrder = created;
      let queuedCount = 0;
      if (executeNow) {
        const submitResult = await prismaStore.submitOrder(created.id);
        latestOrder = submitResult.order;
        if (env.taskSystemEnabled) {
          const queuedItems = submitResult.items.filter((it) => it.executionStatus === "QUEUED");
          for (const item of queuedItems) {
            await prismaStore.updateOrderItem(item.id, { executionStatus: "QUEUED" });
          }
          queuedCount = queuedItems.length;
        }
      }

      await otaPrismaStore.upsertOrderBinding({
        platform: normalizedPlatform,
        externalOrderId,
        localOrderId: created.id,
        autoSubmitState: executeNow ? "EXECUTED" : "TEMPLATE_CREATED",
        bookingConfirmState: "PENDING"
      });

      return {
        platform: normalizedPlatform,
        externalOrderId,
        localOrderId: created.id,
        executeNow,
        queuedCount,
        order: latestOrder
      };
    } catch (err) {
      await otaPrismaStore.upsertOrderBinding({
        platform: normalizedPlatform,
        externalOrderId,
        autoSubmitState: "FAILED",
        notes: err?.message || "create internal order failed"
      });
      throw err;
    }
  },

  async markManualPaymentAndAcknowledge({ platform = "FLIGGY", externalOrderId, localOrderId } = {}) {
    const normalizedPlatform = normalizePlatform(platform);
    const binding = await otaPrismaStore.getOrderBinding({ platform: normalizedPlatform, externalOrderId });
    if (!binding) {
      throw new Error("order binding not found");
    }

    const targetLocalOrderId = String(localOrderId || binding.localOrderId || "").trim();
    if (!targetLocalOrderId) {
      throw new Error("localOrderId is required");
    }

    const order = await prismaStore.getOrder(targetLocalOrderId);
    if (!order) {
      throw new Error("local order not found");
    }

    for (const item of order.items || []) {
      if (item.paymentStatus !== "PAID") {
        await prismaStore.updateOrderItem(item.id, { paymentStatus: "PAID" });
      }
      if (item.status !== "COMPLETED") {
        await prismaStore.updateOrderItem(item.id, { status: "COMPLETED", executionStatus: "DONE" });
      }
    }
    const refreshed = await prismaStore.refreshOrderStatus(order.id);

    const inbound = await otaPrismaStore.getInboundOrder({
      platform: normalizedPlatform,
      externalOrderId
    });
    const tid = inbound?.rawPayload?.tid || inbound?.rawPayload?.order_id || inbound?.rawPayload?.oid || null;

    const { adapter } = getAdapter(normalizedPlatform);
    let ack = {
      confirmed: false,
      confirmCodeUpdated: false,
      tid: tid || null
    };

    if (tid) {
      const confirmResponse = await adapter.confirmOrder({
        tid,
        optType: 2,
        confirmCode: order.id,
        syncToHotel: "Y"
      });

      let confirmCodeResponse = null;
      const pmsResId = String(order.id || "").trim();
      if (pmsResId) {
        confirmCodeResponse = await adapter.updateConfirmCode({
          tid,
          pmsResId,
          outOrderId: externalOrderId
        });
      }
      ack = {
        confirmed: true,
        confirmCodeUpdated: Boolean(confirmCodeResponse),
        tid,
        confirmResponse,
        confirmCodeResponse
      };
    }

    const next = await otaPrismaStore.upsertOrderBinding({
      platform: normalizedPlatform,
      externalOrderId,
      localOrderId: order.id,
      manualPaymentState: "PAID",
      bookingConfirmState: ack.confirmed ? "CONFIRMED" : "PENDING",
      notes: ack.confirmed
        ? "manual payment confirmed and ota notified"
        : "manual payment confirmed, no ota tid available"
    });

    return {
      binding: next,
      order: refreshed,
      ack
    };
  },

  async listOrderBindings({ platform } = {}) {
    return otaPrismaStore.listOrderBindings({ platform: normalizePlatform(platform || "") });
  },

  async listInboundOrders({ platform, status } = {}) {
    const rows = await otaPrismaStore.listInboundOrders({
      platform: normalizePlatform(platform || ""),
      status: String(status || "").trim().toUpperCase()
    });
    return rows.map((it) => sanitizeInboundOrder(it, false));
  },

  async listSyncLogs(limit = 50) {
    return otaPrismaStore.listSyncLogs(limit);
  }
};
