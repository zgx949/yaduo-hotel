import { prisma } from "../lib/prisma.js";

const nowIso = () => new Date().toISOString();

const normalizePlatform = (platform = "") => String(platform || "").trim().toUpperCase();

const toDateText = (value) => {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toISOString().slice(0, 10);
};

const toInt = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : Math.trunc(num);
};

const mapRoom = (row) => ({
  platformRoomTypeId: row.platformRoomTypeId,
  roomTypeName: row.roomTypeName,
  bedType: row.bedType || "",
  gid: row.gid || "",
  rpid: row.rpid || "",
  outRid: row.outRid || "",
  rateplanCode: row.rateplanCode || "",
  vendor: row.vendor || "",
  updatedAt: row.updatedAt?.toISOString?.() || nowIso()
});

export const otaPrismaStore = {
  async listPublishedHotels(filters = {}) {
    const platform = normalizePlatform(filters.platform || "");
    const rows = await prisma.otaHotel.findMany({
      where: {
        platform: platform || undefined
      },
      include: {
        rooms: {
          orderBy: {
            platformRoomTypeId: "asc"
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    return rows.map((row) => ({
      platform: row.platform,
      platformHotelId: row.platformHotelId,
      hotelName: row.hotelName,
      city: row.city || "",
      status: row.status,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
      rooms: (row.rooms || []).map(mapRoom)
    }));
  },

  async upsertPublishedHotels({ platform, hotels = [], source = "sync" }) {
    const normalizedPlatform = normalizePlatform(platform || "");
    const merged = [];

    for (const hotel of Array.isArray(hotels) ? hotels : []) {
      const platformHotelId = String(hotel?.platformHotelId || hotel?.hotelId || "").trim();
      if (!platformHotelId) {
        continue;
      }

      const upsertedHotel = await prisma.otaHotel.upsert({
        where: {
          platform_platformHotelId: {
            platform: normalizedPlatform,
            platformHotelId
          }
        },
        create: {
          platform: normalizedPlatform,
          platformHotelId,
          hotelName: String(hotel?.hotelName || "").trim() || platformHotelId,
          city: String(hotel?.city || "").trim() || null,
          status: String(hotel?.status || "ONLINE").trim().toUpperCase(),
          source: String(source || "sync").trim().toUpperCase(),
          rawPayload: hotel || {},
          lastSyncedAt: new Date()
        },
        update: {
          hotelName: String(hotel?.hotelName || "").trim() || platformHotelId,
          city: String(hotel?.city || "").trim() || null,
          status: String(hotel?.status || "ONLINE").trim().toUpperCase(),
          source: String(source || "sync").trim().toUpperCase(),
          rawPayload: hotel || {},
          lastSyncedAt: new Date()
        }
      });

      const rooms = Array.isArray(hotel?.rooms) ? hotel.rooms : [];
      for (const room of rooms) {
        const platformRoomTypeId = String(room?.platformRoomTypeId || room?.roomTypeId || "").trim();
        if (!platformRoomTypeId) {
          continue;
        }
        await prisma.otaRoomType.upsert({
          where: {
            platform_platformHotelId_platformRoomTypeId: {
              platform: normalizedPlatform,
              platformHotelId,
              platformRoomTypeId
            }
          },
          create: {
            platform: normalizedPlatform,
            platformHotelId,
            platformRoomTypeId,
            roomTypeName: String(room?.roomTypeName || "").trim() || platformRoomTypeId,
            bedType: String(room?.bedType || "").trim() || null,
            gid: room?.gid ? String(room.gid) : null,
            rpid: room?.rpid ? String(room.rpid) : null,
            outRid: room?.outRid ? String(room.outRid) : null,
            rateplanCode: room?.rateplanCode ? String(room.rateplanCode) : null,
            vendor: room?.vendor ? String(room.vendor) : null,
            rawPayload: room || {},
            hotelId: upsertedHotel.id
          },
          update: {
            roomTypeName: String(room?.roomTypeName || "").trim() || platformRoomTypeId,
            bedType: String(room?.bedType || "").trim() || null,
            gid: room?.gid ? String(room.gid) : null,
            rpid: room?.rpid ? String(room.rpid) : null,
            outRid: room?.outRid ? String(room.outRid) : null,
            rateplanCode: room?.rateplanCode ? String(room.rateplanCode) : null,
            vendor: room?.vendor ? String(room.vendor) : null,
            rawPayload: room || {},
            hotelId: upsertedHotel.id
          }
        });
      }

      merged.push({
        platform: upsertedHotel.platform,
        platformHotelId: upsertedHotel.platformHotelId,
        hotelName: upsertedHotel.hotelName,
        city: upsertedHotel.city || "",
        status: upsertedHotel.status,
        updatedAt: upsertedHotel.updatedAt.toISOString()
      });
    }

    await prisma.otaSyncLog.create({
      data: {
        type: "HOTEL_SYNC",
        platform: normalizedPlatform,
        result: {
          count: merged.length
        }
      }
    });

    return merged;
  },

  async upsertHotelMapping(payload = {}) {
    const platform = normalizePlatform(payload.platform || "");
    const platformHotelId = String(payload.platformHotelId || "").trim();
    const row = await prisma.otaHotelMapping.upsert({
      where: {
        platform_platformHotelId: {
          platform,
          platformHotelId
        }
      },
      create: {
        platform,
        platformHotelId,
        platformHotelName: String(payload.platformHotelName || "").trim() || platformHotelId,
        internalChainId: String(payload.internalChainId || "").trim(),
        internalHotelName: String(payload.internalHotelName || "").trim(),
        enabled: payload.enabled !== false
      },
      update: {
        platformHotelName: String(payload.platformHotelName || "").trim() || platformHotelId,
        internalChainId: String(payload.internalChainId || "").trim(),
        internalHotelName: String(payload.internalHotelName || "").trim(),
        enabled: payload.enabled !== false
      }
    });

    await prisma.otaHotel.upsert({
      where: {
        platform_platformHotelId: {
          platform,
          platformHotelId
        }
      },
      create: {
        platform,
        platformHotelId,
        hotelName: row.platformHotelName || platformHotelId,
        city: null,
        status: "ONLINE",
        source: "MAPPING",
        rawPayload: {},
        lastSyncedAt: null
      },
      update: {
        hotelName: row.platformHotelName || platformHotelId
      }
    });

    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async listHotelMappings(filters = {}) {
    const platform = normalizePlatform(filters.platform || "");
    const rows = await prisma.otaHotelMapping.findMany({
      where: {
        platform: platform || undefined
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    return rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString()
    }));
  },

  async upsertRoomMapping(payload = {}) {
    const platform = normalizePlatform(payload.platform || "");
    const platformHotelId = String(payload.platformHotelId || "").trim();
    const platformRoomTypeId = String(payload.platformRoomTypeId || "").trim();

    const row = await prisma.otaRoomMapping.upsert({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform,
          platformHotelId,
          platformRoomTypeId
        }
      },
      create: {
        platform,
        platformHotelId,
        platformRoomTypeId,
        platformRoomTypeName: String(payload.platformRoomTypeName || "").trim() || platformRoomTypeId,
        internalRoomTypeId: String(payload.internalRoomTypeId || "").trim(),
        internalRoomTypeName: String(payload.internalRoomTypeName || "").trim(),
        rateCode: payload.rateCode ? String(payload.rateCode) : null,
        rateCodeId: payload.rateCodeId ? String(payload.rateCodeId) : null,
        rpActivityId: payload.rpActivityId ? String(payload.rpActivityId) : null,
        bookingTier: String(payload.bookingTier || "NORMAL").trim(),
        platformChannel: String(payload.platformChannel || "DEFAULT").trim().toUpperCase(),
        orderSubmitMode: String(payload.orderSubmitMode || "MANUAL").trim().toUpperCase(),
        autoOrderEnabled: payload.autoOrderEnabled !== false,
        autoSyncEnabled: payload.autoSyncEnabled !== false,
        manualTuningEnabled: Boolean(payload.manualTuningEnabled),
        autoSyncFutureDays: Math.max(1, toInt(payload.autoSyncFutureDays, 30)),
        enabled: payload.enabled !== false
      },
      update: {
        platformRoomTypeName: String(payload.platformRoomTypeName || "").trim() || platformRoomTypeId,
        internalRoomTypeId: String(payload.internalRoomTypeId || "").trim(),
        internalRoomTypeName: String(payload.internalRoomTypeName || "").trim(),
        rateCode: payload.rateCode ? String(payload.rateCode) : null,
        rateCodeId: payload.rateCodeId ? String(payload.rateCodeId) : null,
        rpActivityId: payload.rpActivityId ? String(payload.rpActivityId) : null,
        bookingTier: String(payload.bookingTier || "NORMAL").trim(),
        platformChannel: String(payload.platformChannel || "DEFAULT").trim().toUpperCase(),
        orderSubmitMode: String(payload.orderSubmitMode || "MANUAL").trim().toUpperCase(),
        autoOrderEnabled: payload.autoOrderEnabled !== false,
        autoSyncEnabled: payload.autoSyncEnabled !== false,
        manualTuningEnabled: Boolean(payload.manualTuningEnabled),
        autoSyncFutureDays: Math.max(1, toInt(payload.autoSyncFutureDays, 30)),
        enabled: payload.enabled !== false
      }
    });

    await prisma.otaRoomType.upsert({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform,
          platformHotelId,
          platformRoomTypeId
        }
      },
      create: {
        platform,
        platformHotelId,
        platformRoomTypeId,
        roomTypeName: row.platformRoomTypeName || platformRoomTypeId,
        bedType: null,
        outRid: platformRoomTypeId,
        rateplanCode: row.rateCode,
        vendor: null,
        rawPayload: {},
        hotelId: (await prisma.otaHotel.findFirst({
          where: {
            platform,
            platformHotelId
          },
          select: { id: true }
        }))?.id || (await prisma.otaHotel.create({
          data: {
            platform,
            platformHotelId,
            hotelName: platformHotelId,
            city: null,
            status: "ONLINE",
            source: "MAPPING",
            rawPayload: {},
            lastSyncedAt: null
          },
          select: { id: true }
        })).id
      },
      update: {
        roomTypeName: row.platformRoomTypeName || platformRoomTypeId,
        outRid: platformRoomTypeId,
        rateplanCode: row.rateCode
      }
    });

    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async listRoomMappings(filters = {}) {
    const platform = normalizePlatform(filters.platform || "");
    const rows = await prisma.otaRoomMapping.findMany({
      where: {
        platform: platform || undefined
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    return rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString()
    }));
  },

  async getRoomMapping(params = {}) {
    const row = await prisma.otaRoomMapping.findUnique({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform: normalizePlatform(params.platform || ""),
          platformHotelId: String(params.platformHotelId || "").trim(),
          platformRoomTypeId: String(params.platformRoomTypeId || "").trim()
        }
      }
    });
    if (!row) {
      return null;
    }
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async upsertChannelMapping(payload = {}) {
    const row = await prisma.otaChannelMapping.upsert({
      where: {
        platform_platformChannel: {
          platform: normalizePlatform(payload.platform || ""),
          platformChannel: String(payload.platformChannel || "DEFAULT").trim().toUpperCase()
        }
      },
      create: {
        platform: normalizePlatform(payload.platform || ""),
        platformChannel: String(payload.platformChannel || "DEFAULT").trim().toUpperCase(),
        internalBookingTier: String(payload.internalBookingTier || "NORMAL").trim(),
        internalChannelName: String(payload.internalChannelName || "").trim(),
        autoSubmit: Boolean(payload.autoSubmit),
        enabled: payload.enabled !== false
      },
      update: {
        internalBookingTier: String(payload.internalBookingTier || "NORMAL").trim(),
        internalChannelName: String(payload.internalChannelName || "").trim(),
        autoSubmit: Boolean(payload.autoSubmit),
        enabled: payload.enabled !== false
      }
    });

    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async listChannelMappings(filters = {}) {
    const rows = await prisma.otaChannelMapping.findMany({
      where: {
        platform: normalizePlatform(filters.platform || "") || undefined
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    return rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString()
    }));
  },

  async getChannelMapping(params = {}) {
    const row = await prisma.otaChannelMapping.findUnique({
      where: {
        platform_platformChannel: {
          platform: normalizePlatform(params.platform || ""),
          platformChannel: String(params.platformChannel || "DEFAULT").trim().toUpperCase()
        }
      }
    });
    if (!row) {
      return null;
    }
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async upsertCalendarItem(payload = {}) {
    const row = await prisma.otaCalendarItem.upsert({
      where: {
        platform_platformHotelId_platformRoomTypeId_date: {
          platform: normalizePlatform(payload.platform || ""),
          platformHotelId: String(payload.platformHotelId || "").trim(),
          platformRoomTypeId: String(payload.platformRoomTypeId || "").trim(),
          date: toDateText(payload.date)
        }
      },
      create: {
        platform: normalizePlatform(payload.platform || ""),
        platformHotelId: String(payload.platformHotelId || "").trim(),
        platformRoomTypeId: String(payload.platformRoomTypeId || "").trim(),
        date: toDateText(payload.date),
        price: Math.max(0, toInt(payload.price, 0)),
        inventory: Math.max(0, toInt(payload.inventory, 0)),
        currency: String(payload.currency || "CNY").trim().toUpperCase(),
        source: String(payload.source || "manual").trim().toUpperCase(),
        lastPushedAt: payload.lastPushedAt ? new Date(payload.lastPushedAt) : null
      },
      update: {
        price: Math.max(0, toInt(payload.price, 0)),
        inventory: Math.max(0, toInt(payload.inventory, 0)),
        currency: String(payload.currency || "CNY").trim().toUpperCase(),
        source: String(payload.source || "manual").trim().toUpperCase(),
        lastPushedAt: payload.lastPushedAt ? new Date(payload.lastPushedAt) : undefined
      }
    });

    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastPushedAt: row.lastPushedAt ? row.lastPushedAt.toISOString() : null
    };
  },

  async listCalendarItems(filters = {}) {
    const rows = await prisma.otaCalendarItem.findMany({
      where: {
        platform: normalizePlatform(filters.platform || "") || undefined,
        platformHotelId: filters.platformHotelId ? String(filters.platformHotelId).trim() : undefined,
        platformRoomTypeId: filters.platformRoomTypeId ? String(filters.platformRoomTypeId).trim() : undefined,
        date: {
          gte: filters.startDate ? toDateText(filters.startDate) : undefined,
          lte: filters.endDate ? toDateText(filters.endDate) : undefined
        }
      },
      orderBy: [{ date: "asc" }, { updatedAt: "desc" }]
    });
    return rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString(),
      lastPushedAt: it.lastPushedAt ? it.lastPushedAt.toISOString() : null
    }));
  },

  async upsertInboundOrder(payload = {}) {
    const platform = normalizePlatform(payload.platform || "");
    const externalOrderId = String(payload.externalOrderId || "").trim();
    const existed = await prisma.otaInboundOrder.findUnique({
      where: {
        platform_externalOrderId: {
          platform,
          externalOrderId
        }
      }
    });

    const row = await prisma.otaInboundOrder.upsert({
      where: {
        platform_externalOrderId: {
          platform,
          externalOrderId
        }
      },
      create: {
        platform,
        externalOrderId,
        status: String(payload.status || "NEW").trim().toUpperCase(),
        platformHotelId: String(payload.platformHotelId || "").trim(),
        platformRoomTypeId: String(payload.platformRoomTypeId || "").trim(),
        platformChannel: String(payload.platformChannel || "DEFAULT").trim().toUpperCase(),
        customerName: String(payload.customerName || "").trim(),
        contactPhone: payload.contactPhone ? String(payload.contactPhone).trim() : null,
        checkInDate: toDateText(payload.checkInDate),
        checkOutDate: toDateText(payload.checkOutDate),
        roomCount: Math.max(1, toInt(payload.roomCount, 1)),
        amount: Math.max(0, toInt(payload.amount, 0)),
        currency: String(payload.currency || "CNY").trim().toUpperCase(),
        remark: payload.remark ? String(payload.remark) : null,
        rawPayload: payload.rawPayload || {}
      },
      update: {
        status: String(payload.status || existed?.status || "NEW").trim().toUpperCase(),
        platformHotelId: String(payload.platformHotelId || existed?.platformHotelId || "").trim(),
        platformRoomTypeId: String(payload.platformRoomTypeId || existed?.platformRoomTypeId || "").trim(),
        platformChannel: String(payload.platformChannel || existed?.platformChannel || "DEFAULT").trim().toUpperCase(),
        customerName: String(payload.customerName || existed?.customerName || "").trim(),
        contactPhone: payload.contactPhone ? String(payload.contactPhone).trim() : existed?.contactPhone || null,
        checkInDate: toDateText(payload.checkInDate || existed?.checkInDate),
        checkOutDate: toDateText(payload.checkOutDate || existed?.checkOutDate),
        roomCount: Math.max(1, toInt(payload.roomCount || existed?.roomCount, 1)),
        amount: Math.max(0, toInt(payload.amount ?? existed?.amount, 0)),
        currency: String(payload.currency || existed?.currency || "CNY").trim().toUpperCase(),
        remark: payload.remark ? String(payload.remark) : existed?.remark || null,
        rawPayload: payload.rawPayload || existed?.rawPayload || {}
      }
    });

    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      alreadyExists: Boolean(existed)
    };
  },

  async getInboundOrder(params = {}) {
    const row = await prisma.otaInboundOrder.findUnique({
      where: {
        platform_externalOrderId: {
          platform: normalizePlatform(params.platform || ""),
          externalOrderId: String(params.externalOrderId || "").trim()
        }
      }
    });
    if (!row) {
      return null;
    }
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async listInboundOrders(filters = {}) {
    const rows = await prisma.otaInboundOrder.findMany({
      where: {
        platform: normalizePlatform(filters.platform || "") || undefined,
        status: filters.status ? String(filters.status).trim().toUpperCase() : undefined
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    return rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString()
    }));
  },

  async upsertOrderBinding(payload = {}) {
    const platform = normalizePlatform(payload.platform || "");
    const externalOrderId = String(payload.externalOrderId || "").trim();

    const existed = await prisma.otaOrderBinding.findUnique({
      where: {
        platform_externalOrderId: {
          platform,
          externalOrderId
        }
      }
    });

    const row = await prisma.otaOrderBinding.upsert({
      where: {
        platform_externalOrderId: {
          platform,
          externalOrderId
        }
      },
      create: {
        platform,
        externalOrderId,
        localOrderId: payload.localOrderId ? String(payload.localOrderId) : null,
        templatePayload: payload.templatePayload || null,
        autoSubmitState: String(payload.autoSubmitState || "PENDING").trim().toUpperCase(),
        manualPaymentState: String(payload.manualPaymentState || "UNPAID").trim().toUpperCase(),
        bookingConfirmState: String(payload.bookingConfirmState || "PENDING").trim().toUpperCase(),
        notes: payload.notes ? String(payload.notes) : null
      },
      update: {
        localOrderId: payload.localOrderId ? String(payload.localOrderId) : existed?.localOrderId || null,
        templatePayload: payload.templatePayload || existed?.templatePayload || null,
        autoSubmitState: String(payload.autoSubmitState || existed?.autoSubmitState || "PENDING").trim().toUpperCase(),
        manualPaymentState: String(payload.manualPaymentState || existed?.manualPaymentState || "UNPAID").trim().toUpperCase(),
        bookingConfirmState: String(payload.bookingConfirmState || existed?.bookingConfirmState || "PENDING").trim().toUpperCase(),
        notes: payload.notes ? String(payload.notes) : existed?.notes || null
      }
    });

    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async getOrderBinding(params = {}) {
    const row = await prisma.otaOrderBinding.findUnique({
      where: {
        platform_externalOrderId: {
          platform: normalizePlatform(params.platform || ""),
          externalOrderId: String(params.externalOrderId || "").trim()
        }
      }
    });
    if (!row) {
      return null;
    }
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async listOrderBindings(filters = {}) {
    const rows = await prisma.otaOrderBinding.findMany({
      where: {
        platform: normalizePlatform(filters.platform || "") || undefined
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    return rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString()
    }));
  },

  async appendSyncLog(payload = {}) {
    await prisma.otaSyncLog.create({
      data: {
        type: String(payload.type || "UNKNOWN").trim().toUpperCase(),
        platform: normalizePlatform(payload.platform || ""),
        result: payload.result || {}
      }
    });
  },

  async listSyncLogs(limit = 50) {
    const rows = await prisma.otaSyncLog.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: Math.max(1, Number(limit) || 50)
    });
    return rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString()
    }));
  }
};
