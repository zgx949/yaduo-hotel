import { randomUUID } from "node:crypto";

const nowIso = () => new Date().toISOString();

const state = {
  publishedHotels: [],
  hotelMappings: new Map(),
  roomMappings: new Map(),
  channelMappings: new Map(),
  inventoryPriceCalendar: new Map(),
  inboundOrders: new Map(),
  orderBindings: new Map(),
  syncLogs: []
};

const normalizeBookingTier = (value = "NORMAL") => {
  const text = String(value || "NORMAL").trim();
  if (!text) {
    return "NORMAL";
  }
  const [head, ...rest] = text.split(":");
  const normalizedHead = String(head || "NORMAL").trim().toUpperCase();
  if (normalizedHead === "CORPORATE") {
    const corp = rest.join(":").trim();
    return corp ? `CORPORATE:${corp}` : "CORPORATE";
  }
  return normalizedHead;
};

const roomKey = ({ platform, platformHotelId, platformRoomTypeId }) => {
  return `${String(platform || "").trim()}::${String(platformHotelId || "").trim()}::${String(platformRoomTypeId || "").trim()}`;
};

const hotelKey = ({ platform, platformHotelId }) => {
  return `${String(platform || "").trim()}::${String(platformHotelId || "").trim()}`;
};

const calendarKey = ({ platform, platformHotelId, platformRoomTypeId, date }) => {
  return `${roomKey({ platform, platformHotelId, platformRoomTypeId })}::${String(date || "").trim()}`;
};

export const otaPrototypeStore = {
  listPublishedHotels(filters = {}) {
    const platform = String(filters.platform || "").trim().toUpperCase();
    const items = state.publishedHotels
      .filter((it) => !platform || String(it.platform).toUpperCase() === platform)
      .map((it) => ({ ...it }));
    return items;
  },

  upsertPublishedHotels({ platform, hotels = [], source = "sync" }) {
    const normalizedPlatform = String(platform || "").trim().toUpperCase();
    const incoming = Array.isArray(hotels) ? hotels : [];
    const merged = [];

    for (const hotel of incoming) {
      const platformHotelId = String(hotel?.platformHotelId || hotel?.hotelId || "").trim();
      if (!platformHotelId) {
        continue;
      }
      const key = hotelKey({ platform: normalizedPlatform, platformHotelId });
      const existedIndex = state.publishedHotels.findIndex((it) => hotelKey(it) === key);
      const next = {
        platform: normalizedPlatform,
        platformHotelId,
        hotelName: String(hotel?.hotelName || "").trim(),
        city: String(hotel?.city || "").trim(),
        status: String(hotel?.status || "ONLINE").trim().toUpperCase(),
        rooms: Array.isArray(hotel?.rooms)
          ? hotel.rooms.map((room) => ({
            platformRoomTypeId: String(room?.platformRoomTypeId || room?.roomTypeId || "").trim(),
            roomTypeName: String(room?.roomTypeName || "").trim(),
            bedType: String(room?.bedType || "").trim()
          }))
          : [],
        source,
        updatedAt: nowIso()
      };

      if (existedIndex >= 0) {
        state.publishedHotels[existedIndex] = {
          ...state.publishedHotels[existedIndex],
          ...next
        };
        merged.push({ ...state.publishedHotels[existedIndex] });
      } else {
        state.publishedHotels.push(next);
        merged.push({ ...next });
      }
    }

    state.syncLogs.unshift({
      id: randomUUID(),
      type: "HOTEL_SYNC",
      platform: normalizedPlatform,
      count: merged.length,
      createdAt: nowIso()
    });

    return merged;
  },

  upsertHotelMapping(payload = {}) {
    const mapping = {
      id: String(payload.id || randomUUID()),
      platform: String(payload.platform || "").trim().toUpperCase(),
      platformHotelId: String(payload.platformHotelId || "").trim(),
      platformHotelName: String(payload.platformHotelName || "").trim(),
      internalChainId: String(payload.internalChainId || "").trim(),
      internalHotelName: String(payload.internalHotelName || "").trim(),
      enabled: payload.enabled !== false,
      updatedAt: nowIso()
    };
    const key = hotelKey(mapping);
    state.hotelMappings.set(key, mapping);
    return { ...mapping };
  },

  listHotelMappings(filters = {}) {
    const platform = String(filters.platform || "").trim().toUpperCase();
    return Array.from(state.hotelMappings.values())
      .filter((it) => !platform || it.platform === platform)
      .map((it) => ({ ...it }));
  },

  upsertRoomMapping(payload = {}) {
    const mapping = {
      id: String(payload.id || randomUUID()),
      platform: String(payload.platform || "").trim().toUpperCase(),
      platformHotelId: String(payload.platformHotelId || "").trim(),
      platformRoomTypeId: String(payload.platformRoomTypeId || "").trim(),
      platformRoomTypeName: String(payload.platformRoomTypeName || "").trim(),
      internalRoomTypeId: String(payload.internalRoomTypeId || "").trim(),
      internalRoomTypeName: String(payload.internalRoomTypeName || "").trim(),
      rateCode: String(payload.rateCode || "").trim(),
      rateCodeId: String(payload.rateCodeId || "").trim(),
      rpActivityId: String(payload.rpActivityId || "").trim(),
      bookingTier: normalizeBookingTier(payload.bookingTier || "NORMAL"),
      platformChannel: String(payload.platformChannel || "DEFAULT").trim().toUpperCase(),
      orderSubmitMode: String(payload.orderSubmitMode || "MANUAL").trim().toUpperCase(),
      autoOrderEnabled: payload.autoOrderEnabled !== false,
      autoSyncEnabled: payload.autoSyncEnabled !== false,
      manualTuningEnabled: Boolean(payload.manualTuningEnabled),
      autoSyncFutureDays: Math.max(1, Number(payload.autoSyncFutureDays) || 30),
      enabled: payload.enabled !== false,
      updatedAt: nowIso()
    };
    const key = roomKey(mapping);
    state.roomMappings.set(key, mapping);
    return { ...mapping };
  },

  listRoomMappings(filters = {}) {
    const platform = String(filters.platform || "").trim().toUpperCase();
    return Array.from(state.roomMappings.values())
      .filter((it) => !platform || it.platform === platform)
      .map((it) => ({ ...it }));
  },

  getRoomMapping(params = {}) {
    const key = roomKey(params);
    const found = state.roomMappings.get(key);
    return found ? { ...found } : null;
  },

  upsertChannelMapping(payload = {}) {
    const key = `${String(payload.platform || "").trim().toUpperCase()}::${String(payload.platformChannel || "DEFAULT").trim().toUpperCase()}`;
    const mapping = {
      id: String(payload.id || randomUUID()),
      platform: String(payload.platform || "").trim().toUpperCase(),
      platformChannel: String(payload.platformChannel || "DEFAULT").trim().toUpperCase(),
      internalBookingTier: String(payload.internalBookingTier || "NORMAL").trim().toUpperCase(),
      internalChannelName: String(payload.internalChannelName || "").trim(),
      autoSubmit: Boolean(payload.autoSubmit),
      enabled: payload.enabled !== false,
      updatedAt: nowIso()
    };
    state.channelMappings.set(key, mapping);
    return { ...mapping };
  },

  listChannelMappings(filters = {}) {
    const platform = String(filters.platform || "").trim().toUpperCase();
    return Array.from(state.channelMappings.values())
      .filter((it) => !platform || it.platform === platform)
      .map((it) => ({ ...it }));
  },

  getChannelMapping(params = {}) {
    const key = `${String(params.platform || "").trim().toUpperCase()}::${String(params.platformChannel || "DEFAULT").trim().toUpperCase()}`;
    const found = state.channelMappings.get(key);
    return found ? { ...found } : null;
  },

  upsertCalendarItem(payload = {}) {
    const key = calendarKey(payload);
    const item = {
      id: String(payload.id || randomUUID()),
      platform: String(payload.platform || "").trim().toUpperCase(),
      platformHotelId: String(payload.platformHotelId || "").trim(),
      platformRoomTypeId: String(payload.platformRoomTypeId || "").trim(),
      date: String(payload.date || "").trim(),
      price: Number(payload.price) || 0,
      inventory: Math.max(0, Number(payload.inventory) || 0),
      currency: String(payload.currency || "CNY").trim().toUpperCase(),
      source: String(payload.source || "manual").trim(),
      updatedAt: nowIso(),
      lastPushedAt: payload.lastPushedAt || null
    };
    state.inventoryPriceCalendar.set(key, item);
    return { ...item };
  },

  listCalendarItems(filters = {}) {
    const platform = String(filters.platform || "").trim().toUpperCase();
    const platformHotelId = String(filters.platformHotelId || "").trim();
    const platformRoomTypeId = String(filters.platformRoomTypeId || "").trim();
    const startDate = String(filters.startDate || "").trim();
    const endDate = String(filters.endDate || "").trim();

    return Array.from(state.inventoryPriceCalendar.values())
      .filter((it) => {
        if (platform && it.platform !== platform) {
          return false;
        }
        if (platformHotelId && it.platformHotelId !== platformHotelId) {
          return false;
        }
        if (platformRoomTypeId && it.platformRoomTypeId !== platformRoomTypeId) {
          return false;
        }
        if (startDate && it.date < startDate) {
          return false;
        }
        if (endDate && it.date > endDate) {
          return false;
        }
        return true;
      })
      .map((it) => ({ ...it }));
  },

  upsertInboundOrder(payload = {}) {
    const platform = String(payload.platform || "").trim().toUpperCase();
    const externalOrderId = String(payload.externalOrderId || "").trim();
    const key = `${platform}::${externalOrderId}`;
    const existed = state.inboundOrders.get(key);

    const next = {
      id: existed?.id || String(payload.id || randomUUID()),
      platform,
      externalOrderId,
      status: String(payload.status || existed?.status || "NEW").trim().toUpperCase(),
      platformHotelId: String(payload.platformHotelId || existed?.platformHotelId || "").trim(),
      platformRoomTypeId: String(payload.platformRoomTypeId || existed?.platformRoomTypeId || "").trim(),
      platformChannel: String(payload.platformChannel || existed?.platformChannel || "DEFAULT").trim().toUpperCase(),
      customerName: String(payload.customerName || existed?.customerName || "").trim(),
      contactPhone: String(payload.contactPhone || existed?.contactPhone || "").trim(),
      checkInDate: String(payload.checkInDate || existed?.checkInDate || "").trim(),
      checkOutDate: String(payload.checkOutDate || existed?.checkOutDate || "").trim(),
      roomCount: Math.max(1, Number(payload.roomCount || existed?.roomCount) || 1),
      amount: Number(payload.amount ?? existed?.amount) || 0,
      currency: String(payload.currency || existed?.currency || "CNY").trim().toUpperCase(),
      remark: String(payload.remark || existed?.remark || "").trim(),
      rawPayload: payload.rawPayload || existed?.rawPayload || {},
      createdAt: existed?.createdAt || nowIso(),
      updatedAt: nowIso()
    };

    state.inboundOrders.set(key, next);
    return {
      ...next,
      alreadyExists: Boolean(existed)
    };
  },

  getInboundOrder(params = {}) {
    const key = `${String(params.platform || "").trim().toUpperCase()}::${String(params.externalOrderId || "").trim()}`;
    const found = state.inboundOrders.get(key);
    return found ? { ...found } : null;
  },

  listInboundOrders(filters = {}) {
    const platform = String(filters.platform || "").trim().toUpperCase();
    const status = String(filters.status || "").trim().toUpperCase();
    return Array.from(state.inboundOrders.values())
      .filter((it) => {
        if (platform && it.platform !== platform) {
          return false;
        }
        if (status && it.status !== status) {
          return false;
        }
        return true;
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((it) => ({ ...it }));
  },

  upsertOrderBinding(payload = {}) {
    const key = `${String(payload.platform || "").trim().toUpperCase()}::${String(payload.externalOrderId || "").trim()}`;
    const existed = state.orderBindings.get(key);
    const next = {
      id: existed?.id || String(payload.id || randomUUID()),
      platform: String(payload.platform || existed?.platform || "").trim().toUpperCase(),
      externalOrderId: String(payload.externalOrderId || existed?.externalOrderId || "").trim(),
      localOrderId: payload.localOrderId ? String(payload.localOrderId) : (existed?.localOrderId || null),
      templatePayload: payload.templatePayload || existed?.templatePayload || null,
      autoSubmitState: String(payload.autoSubmitState || existed?.autoSubmitState || "PENDING").trim().toUpperCase(),
      manualPaymentState: String(payload.manualPaymentState || existed?.manualPaymentState || "UNPAID").trim().toUpperCase(),
      bookingConfirmState: String(payload.bookingConfirmState || existed?.bookingConfirmState || "PENDING").trim().toUpperCase(),
      notes: String(payload.notes || existed?.notes || "").trim(),
      updatedAt: nowIso(),
      createdAt: existed?.createdAt || nowIso()
    };
    state.orderBindings.set(key, next);
    return { ...next };
  },

  getOrderBinding(params = {}) {
    const key = `${String(params.platform || "").trim().toUpperCase()}::${String(params.externalOrderId || "").trim()}`;
    const found = state.orderBindings.get(key);
    return found ? { ...found } : null;
  },

  listOrderBindings(filters = {}) {
    const platform = String(filters.platform || "").trim().toUpperCase();
    return Array.from(state.orderBindings.values())
      .filter((it) => !platform || it.platform === platform)
      .map((it) => ({ ...it }));
  },

  appendSyncLog(payload = {}) {
    state.syncLogs.unshift({
      id: String(payload.id || randomUUID()),
      type: String(payload.type || "UNKNOWN").trim().toUpperCase(),
      platform: String(payload.platform || "").trim().toUpperCase(),
      result: payload.result || {},
      createdAt: nowIso()
    });
  },

  listSyncLogs(limit = 50) {
    return state.syncLogs.slice(0, Math.max(1, Number(limit) || 50)).map((it) => ({ ...it }));
  }
};
