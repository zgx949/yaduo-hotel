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

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const toOptionalString = (value) => {
  const text = String(value || "").trim();
  return text || null;
};

const toOptionalDate = (value) => {
  if (value === null) {
    return null;
  }
  if (value === undefined || value === "") {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed;
};

const normalizeRateplanEntry = (item = {}) => {
  const rateplanCode = String(item.rateplanCode || item.rateplan_code || item.code || "").trim();
  if (!rateplanCode) {
    return null;
  }
  return {
    rateplanCode,
    rateplanName: String(item.rateplanName || item.name || "").trim(),
    rpid: String(item.rpid || item.rp_id || "").trim(),
    status: String(item.status || "").trim(),
    breakfastCount: Number(item.breakfastCount ?? item.breakfast_count ?? 0) || 0,
    paymentType: String(item.paymentType ?? item.payment_type ?? "").trim(),
    cancelPolicy: String(item.cancelPolicy ?? item.cancel_policy ?? "").trim(),
    modifiedTime: String(item.modifiedTime || item.modified_time || "").trim(),
    rawPayload: item.rawPayload || item || {}
  };
};

const extractRateplansFromRoomPayload = (payload = {}) => {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const direct = Array.isArray(payload.rateplans) ? payload.rateplans : [];
  const candidates = direct.map(normalizeRateplanEntry).filter(Boolean);
  return candidates;
};

const mergeRateplanArrays = (base = [], incoming = []) => {
  const merged = new Map();
  for (const item of Array.isArray(base) ? base : []) {
    const normalized = normalizeRateplanEntry(item);
    if (normalized) {
      merged.set(normalized.rateplanCode, normalized);
    }
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const normalized = normalizeRateplanEntry(item);
    if (normalized) {
      merged.set(normalized.rateplanCode, normalized);
    }
  }
  return Array.from(merged.values());
};

const mergeRoomRawPayload = (existedPayload = {}, incomingPayload = {}) => {
  const next = {
    ...(existedPayload || {}),
    ...(incomingPayload || {})
  };
  const mergedRateplans = mergeRateplanArrays(
    extractRateplansFromRoomPayload(existedPayload || {}),
    extractRateplansFromRoomPayload(incomingPayload || {})
  );
  if (mergedRateplans.length > 0) {
    next.rateplans = mergedRateplans;
  }
  return next;
};

const strategyConfigKey = (platformChannel, rateCode) => {
  const ch = String(platformChannel || "DEFAULT").trim().toUpperCase() || "DEFAULT";
  const rc = String(rateCode || "").trim();
  return `${ch}::${rc}`;
};

const readStrategyFormula = (roomRawPayload = {}, platformChannel, rateCode) => {
  if (!roomRawPayload || typeof roomRawPayload !== "object") {
    return {
      formulaMultiplier: 1,
      formulaAddend: 0
    };
  }
  const configs = roomRawPayload.strategyConfigs;
  if (!configs || typeof configs !== "object" || Array.isArray(configs)) {
    return {
      formulaMultiplier: 1,
      formulaAddend: 0
    };
  }
  const cfg = configs[strategyConfigKey(platformChannel, rateCode)] || {};
  const multiplier = Number(cfg.formulaMultiplier);
  const addend = Number(cfg.formulaAddend);
  return {
    formulaMultiplier: Number.isFinite(multiplier) ? multiplier : 1,
    formulaAddend: Number.isFinite(addend) ? addend : 0
  };
};

const writeStrategyFormula = (roomRawPayload = {}, platformChannel, rateCode, formula = {}) => {
  const payload = roomRawPayload && typeof roomRawPayload === "object" && !Array.isArray(roomRawPayload)
    ? { ...roomRawPayload }
    : {};
  const strategyConfigs = payload.strategyConfigs && typeof payload.strategyConfigs === "object" && !Array.isArray(payload.strategyConfigs)
    ? { ...payload.strategyConfigs }
    : {};
  const multiplier = Number(formula.formulaMultiplier);
  const addend = Number(formula.formulaAddend);
  strategyConfigs[strategyConfigKey(platformChannel, rateCode)] = {
    formulaMultiplier: Number.isFinite(multiplier) ? multiplier : 1,
    formulaAddend: Number.isFinite(addend) ? addend : 0,
    updatedAt: nowIso()
  };
  payload.strategyConfigs = strategyConfigs;
  return payload;
};

const mapRoom = (row) => ({
  platformRoomTypeId: row.platformRoomTypeId,
  roomTypeName: row.roomTypeName,
  bedType: row.bedType || "",
  area: row.rawPayload?.area || "",
  floor: row.rawPayload?.floor || "",
  maxOccupancy: Number(row.rawPayload?.maxOccupancy || row.rawPayload?.max_occupancy || 0) || null,
  windowType: row.rawPayload?.windowType || row.rawPayload?.window_type || "",
  status: row.rawPayload?.status || "",
  rateplans: extractRateplansFromRoomPayload(row.rawPayload || {}),
  gid: row.gid || "",
  rpid: row.rpid || "",
  outRid: row.outRid || "",
  rateplanCode: row.rateplanCode || "",
  vendor: row.vendor || "",
  rawPayload: row.rawPayload || null,
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
      cityId: row.cityId || "",
      city: row.city || "",
      address: row.address || "",
      tel: row.tel || "",
      status: row.status,
      source: row.source,
      updatedAt: row.updatedAt.toISOString(),
      rawPayload: row.rawPayload || null,
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
          cityId: String(hotel?.cityId || "").trim() || null,
          city: String(hotel?.city || "").trim() || null,
          address: String(hotel?.address || "").trim() || null,
          tel: String(hotel?.tel || "").trim() || null,
          status: String(hotel?.status || "ONLINE").trim().toUpperCase(),
          source: String(source || "sync").trim().toUpperCase(),
          rawPayload: hotel?.rawPayload || hotel || {},
          lastSyncedAt: new Date()
        },
        update: {
          hotelName: String(hotel?.hotelName || "").trim() || platformHotelId,
          cityId: String(hotel?.cityId || "").trim() || null,
          city: String(hotel?.city || "").trim() || null,
          address: String(hotel?.address || "").trim() || null,
          tel: String(hotel?.tel || "").trim() || null,
          status: String(hotel?.status || "ONLINE").trim().toUpperCase(),
          source: String(source || "sync").trim().toUpperCase(),
          rawPayload: hotel?.rawPayload || hotel || {},
          lastSyncedAt: new Date()
        }
      });

      const rooms = Array.isArray(hotel?.rooms) ? hotel.rooms : [];
      for (const room of rooms) {
        const platformRoomTypeId = String(room?.platformRoomTypeId || room?.roomTypeId || "").trim();
        if (!platformRoomTypeId) {
          continue;
        }
        const existedRoom = await prisma.otaRoomType.findUnique({
          where: {
            platform_platformHotelId_platformRoomTypeId: {
              platform: normalizedPlatform,
              platformHotelId,
              platformRoomTypeId
            }
          },
          select: {
            rawPayload: true
          }
        });
        const existedPayload = existedRoom?.rawPayload && typeof existedRoom.rawPayload === "object" ? existedRoom.rawPayload : {};
        const incomingPayload = room?.rawPayload && typeof room.rawPayload === "object" ? room.rawPayload : (room || {});
        const mergedPayload = mergeRoomRawPayload(existedPayload, incomingPayload);

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
            rawPayload: mergedPayload,
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
            rawPayload: mergedPayload,
            hotelId: upsertedHotel.id
          }
        });
      }

      merged.push({
        platform: upsertedHotel.platform,
        platformHotelId: upsertedHotel.platformHotelId,
        hotelName: upsertedHotel.hotelName,
        cityId: upsertedHotel.cityId || "",
        city: upsertedHotel.city || "",
        address: upsertedHotel.address || "",
        tel: upsertedHotel.tel || "",
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

  async upsertRoomRatePlan({ platform, platformHotelId, platformRoomTypeId, rateplan = {} }) {
    const normalizedPlatform = normalizePlatform(platform || "");
    const hotelId = String(platformHotelId || "").trim();
    const roomId = String(platformRoomTypeId || "").trim();
    const normalizedRateplan = normalizeRateplanEntry(rateplan);
    if (!normalizedPlatform || !hotelId || !roomId || !normalizedRateplan) {
      throw new Error("platform/hotel/room/rateplanCode is required");
    }

    const hotel =
      (await prisma.otaHotel.findFirst({
        where: {
          platform: normalizedPlatform,
          platformHotelId: hotelId
        },
        select: { id: true, hotelName: true }
      })) ||
      (await prisma.otaHotel.create({
        data: {
          platform: normalizedPlatform,
          platformHotelId: hotelId,
          hotelName: hotelId,
          city: null,
          status: "ONLINE",
          source: "RATEPLAN_IMPORT",
          rawPayload: {},
          lastSyncedAt: null
        },
        select: { id: true, hotelName: true }
      }));

    const existed = await prisma.otaRoomType.findUnique({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform: normalizedPlatform,
          platformHotelId: hotelId,
          platformRoomTypeId: roomId
        }
      }
    });

    const existedPayload = existed?.rawPayload && typeof existed.rawPayload === "object" ? existed.rawPayload : {};
    const existedRateplans = extractRateplansFromRoomPayload(existedPayload);
    const merged = new Map(existedRateplans.map((it) => [it.rateplanCode, it]));
    merged.set(normalizedRateplan.rateplanCode, normalizedRateplan);
    const mergedRateplans = Array.from(merged.values());

    const nextPayload = {
      ...(existedPayload || {}),
      rateplans: mergedRateplans,
      lastRateplanCode: normalizedRateplan.rateplanCode
    };

    const room = await prisma.otaRoomType.upsert({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform: normalizedPlatform,
          platformHotelId: hotelId,
          platformRoomTypeId: roomId
        }
      },
      create: {
        platform: normalizedPlatform,
        platformHotelId: hotelId,
        platformRoomTypeId: roomId,
        roomTypeName: roomId,
        bedType: null,
        gid: null,
        rpid: normalizedRateplan.rpid || null,
        outRid: roomId,
        rateplanCode: normalizedRateplan.rateplanCode,
        vendor: null,
        rawPayload: nextPayload,
        hotelId: hotel.id
      },
      update: {
        rpid: normalizedRateplan.rpid || existed?.rpid || null,
        rateplanCode: normalizedRateplan.rateplanCode,
        rawPayload: nextPayload,
        hotelId: hotel.id
      }
    });

    return {
      platform: normalizedPlatform,
      platformHotelId: hotelId,
      platformRoomTypeId: roomId,
      rateplan: normalizedRateplan,
      rateplans: mergedRateplans,
      roomTypeName: room.roomTypeName
    };
  },

  async deleteRoomRatePlan({ platform, platformHotelId, platformRoomTypeId, rateplanCode }) {
    const normalizedPlatform = normalizePlatform(platform || "");
    const hotelId = String(platformHotelId || "").trim();
    const roomId = String(platformRoomTypeId || "").trim();
    const code = String(rateplanCode || "").trim();
    if (!normalizedPlatform || !hotelId || !roomId || !code) {
      return {
        removed: false,
        rateplans: []
      };
    }

    const existed = await prisma.otaRoomType.findUnique({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform: normalizedPlatform,
          platformHotelId: hotelId,
          platformRoomTypeId: roomId
        }
      }
    });
    if (!existed) {
      return {
        removed: false,
        rateplans: []
      };
    }

    const existedPayload = existed?.rawPayload && typeof existed.rawPayload === "object" ? existed.rawPayload : {};
    const oldRateplans = extractRateplansFromRoomPayload(existedPayload);
    const nextRateplans = oldRateplans.filter((it) => it.rateplanCode !== code);
    const removed = nextRateplans.length !== oldRateplans.length;
    if (!removed) {
      return {
        removed: false,
        rateplans: oldRateplans
      };
    }
    const nextPrimary = nextRateplans[0] || null;

    await prisma.otaRoomType.update({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform: normalizedPlatform,
          platformHotelId: hotelId,
          platformRoomTypeId: roomId
        }
      },
      data: {
        rateplanCode: nextPrimary?.rateplanCode || null,
        rpid: nextPrimary?.rpid || null,
        rawPayload: {
          ...(existedPayload || {}),
          rateplans: nextRateplans,
          lastRateplanCode: nextPrimary?.rateplanCode || null
        }
      }
    });

    return {
      removed,
      rateplans: nextRateplans
    };
  },

  async deletePublishedRoomType({ platform, platformHotelId, platformRoomTypeId }) {
    const normalizedPlatform = normalizePlatform(platform || "");
    const hotelId = String(platformHotelId || "").trim();
    const roomId = String(platformRoomTypeId || "").trim();
    if (!normalizedPlatform || !hotelId || !roomId) {
      return 0;
    }
    const result = await prisma.otaRoomType.deleteMany({
      where: {
        platform: normalizedPlatform,
        platformHotelId: hotelId,
        platformRoomTypeId: roomId
      }
    });
    return Number(result?.count || 0);
  },

  async deletePublishedHotelLocal({ platform, platformHotelId }) {
    const normalizedPlatform = normalizePlatform(platform || "");
    const hotelId = String(platformHotelId || "").trim();
    if (!normalizedPlatform || !hotelId) {
      return {
        hotelCount: 0,
        roomTypeCount: 0,
        hotelMappingCount: 0,
        roomMappingCount: 0,
        calendarCount: 0
      };
    }

    const [
      roomTypeDelete,
      roomMappingDelete,
      calendarDelete,
      hotelMappingDelete,
      hotelDelete
    ] = await Promise.all([
      prisma.otaRoomType.deleteMany({
        where: {
          platform: normalizedPlatform,
          platformHotelId: hotelId
        }
      }),
      prisma.otaRoomMapping.deleteMany({
        where: {
          platform: normalizedPlatform,
          platformHotelId: hotelId
        }
      }),
      prisma.otaCalendarItem.deleteMany({
        where: {
          platform: normalizedPlatform,
          platformHotelId: hotelId
        }
      }),
      prisma.otaHotelMapping.deleteMany({
        where: {
          platform: normalizedPlatform,
          platformHotelId: hotelId
        }
      }),
      prisma.otaHotel.deleteMany({
        where: {
          platform: normalizedPlatform,
          platformHotelId: hotelId
        }
      })
    ]);

    return {
      hotelCount: Number(hotelDelete?.count || 0),
      roomTypeCount: Number(roomTypeDelete?.count || 0),
      hotelMappingCount: Number(hotelMappingDelete?.count || 0),
      roomMappingCount: Number(roomMappingDelete?.count || 0),
      calendarCount: Number(calendarDelete?.count || 0)
    };
  },

  async upsertHotelMapping(payload = {}) {
    const platform = normalizePlatform(payload.platform || "");
    const platformHotelId = String(payload.platformHotelId || "").trim();
    const nextShid = hasOwn(payload, "shid") ? toOptionalString(payload.shid) : undefined;
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
          shid: nextShid ?? null,
          platformHotelName: String(payload.platformHotelName || "").trim() || platformHotelId,
          internalChainId: String(payload.internalChainId || "").trim(),
          internalHotelName: String(payload.internalHotelName || "").trim(),
          enabled: payload.enabled !== false
        },
        update: {
          ...(nextShid !== undefined ? { shid: nextShid } : {}),
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
    const platformChannel = String(payload.platformChannel || "DEFAULT").trim().toUpperCase();
    const rateCode = String(payload.rateCode || "").trim();
    const formulaMultiplier = Number(payload.formulaMultiplier);
    const formulaAddend = Number(payload.formulaAddend);
    const normalizedFormula = {
      formulaMultiplier: Number.isFinite(formulaMultiplier) ? formulaMultiplier : 1,
      formulaAddend: Number.isFinite(formulaAddend) ? formulaAddend : 0
    };
    if (!rateCode) {
      throw new Error("rateCode (rateplan_code) is required");
    }

    const createData = {
        platform,
        platformHotelId,
        platformRoomTypeId,
        srid: toOptionalString(payload.srid),
        platformRoomTypeName: String(payload.platformRoomTypeName || "").trim() || platformRoomTypeId,
        internalRoomTypeId: String(payload.internalRoomTypeId || "").trim(),
        internalRoomTypeName: String(payload.internalRoomTypeName || "").trim(),
        rateCode,
        rateCodeId: payload.rateCodeId ? String(payload.rateCodeId) : null,
        rpActivityId: payload.rpActivityId ? String(payload.rpActivityId) : null,
        breakfastCount: Math.max(0, toInt(payload.breakfastCount, 0)),
        guaranteeType: Math.max(0, toInt(payload.guaranteeType, 0)),
        cancelPolicyCal: payload.cancelPolicyCal ?? null,
        publishStatus: String(payload.publishStatus || "DRAFT").trim().toUpperCase() || "DRAFT",
        lastPublishedAt: toOptionalDate(payload.lastPublishedAt) ?? null,
        lastPublishError: toOptionalString(payload.lastPublishError),
        bookingTier: String(payload.bookingTier || "NORMAL").trim(),
        platformChannel,
        orderSubmitMode: String(payload.orderSubmitMode || "MANUAL").trim().toUpperCase(),
        autoOrderEnabled: payload.autoOrderEnabled !== false,
        autoSyncEnabled: payload.autoSyncEnabled !== false,
        manualTuningEnabled: Boolean(payload.manualTuningEnabled),
        autoSyncFutureDays: Math.max(1, toInt(payload.autoSyncFutureDays, 30)),
        enabled: payload.enabled !== false
      };
    const updateData = {
        platformRoomTypeName: String(payload.platformRoomTypeName || "").trim() || platformRoomTypeId,
        internalRoomTypeId: String(payload.internalRoomTypeId || "").trim(),
        internalRoomTypeName: String(payload.internalRoomTypeName || "").trim(),
        rateCode,
        rateCodeId: payload.rateCodeId ? String(payload.rateCodeId) : null,
        rpActivityId: payload.rpActivityId ? String(payload.rpActivityId) : null,
        bookingTier: String(payload.bookingTier || "NORMAL").trim(),
        platformChannel,
        orderSubmitMode: String(payload.orderSubmitMode || "MANUAL").trim().toUpperCase(),
        autoOrderEnabled: payload.autoOrderEnabled !== false,
        autoSyncEnabled: payload.autoSyncEnabled !== false,
        manualTuningEnabled: Boolean(payload.manualTuningEnabled),
        autoSyncFutureDays: Math.max(1, toInt(payload.autoSyncFutureDays, 30)),
        enabled: payload.enabled !== false
      };
    if (hasOwn(payload, "srid")) {
      updateData.srid = toOptionalString(payload.srid);
    }
    if (hasOwn(payload, "breakfastCount")) {
      updateData.breakfastCount = Math.max(0, toInt(payload.breakfastCount, 0));
    }
    if (hasOwn(payload, "guaranteeType")) {
      updateData.guaranteeType = Math.max(0, toInt(payload.guaranteeType, 0));
    }
    if (hasOwn(payload, "cancelPolicyCal")) {
      updateData.cancelPolicyCal = payload.cancelPolicyCal ?? null;
    }
    if (hasOwn(payload, "publishStatus")) {
      updateData.publishStatus = String(payload.publishStatus || "DRAFT").trim().toUpperCase() || "DRAFT";
    }
    if (hasOwn(payload, "lastPublishedAt")) {
      updateData.lastPublishedAt = toOptionalDate(payload.lastPublishedAt);
    }
    if (hasOwn(payload, "lastPublishError")) {
      updateData.lastPublishError = toOptionalString(payload.lastPublishError);
    }

    const existed = await prisma.otaRoomMapping.findFirst({
      where: {
        platform,
        platformHotelId,
        platformRoomTypeId,
        platformChannel,
        rateCode
      },
      select: { id: true }
    });
    const row = existed
      ? await prisma.otaRoomMapping.update({
        where: { id: existed.id },
        data: updateData
      })
      : await prisma.otaRoomMapping.create({
        data: createData
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

    const roomExisted = await prisma.otaRoomType.findUnique({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform,
          platformHotelId,
          platformRoomTypeId
        }
      },
      select: {
        rawPayload: true
      }
    });
    const roomPayload = roomExisted?.rawPayload && typeof roomExisted.rawPayload === "object"
      ? roomExisted.rawPayload
      : {};
    const nextRoomPayload = writeStrategyFormula(roomPayload, platformChannel, rateCode, normalizedFormula);
    await prisma.otaRoomType.update({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform,
          platformHotelId,
          platformRoomTypeId
        }
      },
      data: {
        rawPayload: nextRoomPayload
      }
    });

    const appliedFormula = readStrategyFormula(nextRoomPayload, platformChannel, rateCode);
    return {
      ...row,
      ...appliedFormula,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },

  async listRoomMappings(filters = {}) {
    const platform = normalizePlatform(filters.platform || "");
    const platformHotelId = filters.platformHotelId ? String(filters.platformHotelId).trim() : "";
    const platformRoomTypeId = filters.platformRoomTypeId ? String(filters.platformRoomTypeId).trim() : "";
    const platformChannel = filters.platformChannel ? String(filters.platformChannel).trim().toUpperCase() : "";
    const rows = await prisma.otaRoomMapping.findMany({
      where: {
        platform: platform || undefined,
        platformHotelId: platformHotelId || undefined,
        platformRoomTypeId: platformRoomTypeId || undefined,
        platformChannel: platformChannel || undefined
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
    const roomKeys = Array.from(new Set(rows.map((it) => `${it.platform}::${it.platformHotelId}::${it.platformRoomTypeId}`)));
    const roomPayloadMap = new Map();
    for (const key of roomKeys) {
      const [platformKey, hotelId, roomId] = key.split("::");
      const room = await prisma.otaRoomType.findUnique({
        where: {
          platform_platformHotelId_platformRoomTypeId: {
            platform: platformKey,
            platformHotelId: hotelId,
            platformRoomTypeId: roomId
          }
        },
        select: {
          rawPayload: true
        }
      });
      roomPayloadMap.set(key, room?.rawPayload && typeof room.rawPayload === "object" ? room.rawPayload : {});
    }

    return rows.map((it) => {
      const key = `${it.platform}::${it.platformHotelId}::${it.platformRoomTypeId}`;
      const formula = readStrategyFormula(roomPayloadMap.get(key), it.platformChannel, it.rateCode);
      return {
        ...it,
        ...formula,
        createdAt: it.createdAt.toISOString(),
        updatedAt: it.updatedAt.toISOString()
      };
    });
  },

  async getProductCenterTree(filters = {}) {
    const platform = normalizePlatform(filters.platform || "");
    const where = {
      platform: platform || undefined
    };
    const [hotels, hotelMappings, roomTypes, roomMappings] = await Promise.all([
      prisma.otaHotel.findMany({
        where,
        orderBy: [{ platform: "asc" }, { platformHotelId: "asc" }]
      }),
      prisma.otaHotelMapping.findMany({
        where,
        orderBy: [{ platform: "asc" }, { platformHotelId: "asc" }]
      }),
      prisma.otaRoomType.findMany({
        where,
        orderBy: [{ platform: "asc" }, { platformHotelId: "asc" }, { platformRoomTypeId: "asc" }]
      }),
      prisma.otaRoomMapping.findMany({
        where,
        orderBy: [
          { platform: "asc" },
          { platformHotelId: "asc" },
          { platformRoomTypeId: "asc" },
          { platformChannel: "asc" },
          { rateCode: "asc" }
        ]
      })
    ]);

    const hotelMap = new Map();
    for (const hotel of hotels) {
      const key = `${hotel.platform}::${hotel.platformHotelId}`;
      hotelMap.set(key, {
        platform: hotel.platform,
        platformHotelId: hotel.platformHotelId,
        hotelName: hotel.hotelName,
        cityId: hotel.cityId || "",
        city: hotel.city || "",
        address: hotel.address || "",
        tel: hotel.tel || "",
        status: hotel.status,
        source: hotel.source,
        rawPayload: hotel.rawPayload || null,
        updatedAt: hotel.updatedAt.toISOString(),
        mapping: null,
        rooms: []
      });
    }

    const hotelNameFallbackMap = new Map();
    for (const mapping of hotelMappings) {
      const key = `${mapping.platform}::${mapping.platformHotelId}`;
      const mappedName = String(mapping.platformHotelName || mapping.internalHotelName || mapping.platformHotelId || "").trim();
      if (mappedName) {
        hotelNameFallbackMap.set(key, mappedName);
      }
    }

    for (const mapping of hotelMappings) {
      const key = `${mapping.platform}::${mapping.platformHotelId}`;
      const current = hotelMap.get(key) || {
        platform: mapping.platform,
        platformHotelId: mapping.platformHotelId,
        hotelName: mapping.platformHotelName || mapping.platformHotelId,
        cityId: "",
        city: "",
        address: "",
        tel: "",
        status: "ONLINE",
        source: "MAPPING",
        rawPayload: null,
        updatedAt: mapping.updatedAt.toISOString(),
        mapping: null,
        rooms: []
      };
      if ((!current.hotelName || current.hotelName === current.platformHotelId) && String(mapping.platformHotelName || "").trim()) {
        current.hotelName = String(mapping.platformHotelName || "").trim();
      }
      if ((!current.hotelName || current.hotelName === current.platformHotelId) && String(mapping.internalHotelName || "").trim()) {
        current.hotelName = String(mapping.internalHotelName || "").trim();
      }
      current.mapping = {
        ...mapping,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString()
      };
      hotelMap.set(key, current);
    }

    const roomMap = new Map();
    for (const room of roomTypes) {
      const hotelKey = `${room.platform}::${room.platformHotelId}`;
      const roomKey = `${room.platform}::${room.platformHotelId}::${room.platformRoomTypeId}`;
      const hotelNode = hotelMap.get(hotelKey) || {
        platform: room.platform,
        platformHotelId: room.platformHotelId,
        hotelName: hotelNameFallbackMap.get(hotelKey) || room.platformHotelId,
        cityId: "",
        city: "",
        address: "",
        tel: "",
        status: "ONLINE",
        source: "SYNC",
        rawPayload: null,
        updatedAt: room.updatedAt.toISOString(),
        mapping: null,
        rooms: []
      };
      hotelMap.set(hotelKey, hotelNode);
      const roomNode = {
        platformRoomTypeId: room.platformRoomTypeId,
        roomTypeName: room.roomTypeName,
        bedType: room.bedType || "",
        gid: room.gid || "",
        rpid: room.rpid || "",
        outRid: room.outRid || "",
        rateplanCode: room.rateplanCode || "",
        vendor: room.vendor || "",
        rawPayload: room.rawPayload || null,
        updatedAt: room.updatedAt.toISOString(),
        strategies: []
      };
      hotelNode.rooms.push(roomNode);
      roomMap.set(roomKey, roomNode);
    }

    for (const mapping of roomMappings) {
      const hotelKey = `${mapping.platform}::${mapping.platformHotelId}`;
      const roomKey = `${mapping.platform}::${mapping.platformHotelId}::${mapping.platformRoomTypeId}`;
      const hotelNode = hotelMap.get(hotelKey) || {
        platform: mapping.platform,
        platformHotelId: mapping.platformHotelId,
        hotelName: hotelNameFallbackMap.get(hotelKey) || mapping.platformHotelId,
        cityId: "",
        city: "",
        address: "",
        tel: "",
        status: "ONLINE",
        source: "MAPPING",
        rawPayload: null,
        updatedAt: mapping.updatedAt.toISOString(),
        mapping: null,
        rooms: []
      };
      hotelMap.set(hotelKey, hotelNode);

      let roomNode = roomMap.get(roomKey);
      if (!roomNode) {
        roomNode = {
          platformRoomTypeId: mapping.platformRoomTypeId,
          roomTypeName: mapping.platformRoomTypeName || mapping.internalRoomTypeName || mapping.rateCode || mapping.platformRoomTypeId,
          bedType: "",
          gid: "",
          rpid: "",
          outRid: mapping.platformRoomTypeId,
          rateplanCode: mapping.rateCode,
          vendor: "",
          rawPayload: null,
          updatedAt: mapping.updatedAt.toISOString(),
          strategies: []
        };
        roomMap.set(roomKey, roomNode);
        hotelNode.rooms.push(roomNode);
      } else if ((!roomNode.roomTypeName || roomNode.roomTypeName === roomNode.platformRoomTypeId)
        && String(mapping.platformRoomTypeName || mapping.internalRoomTypeName || "").trim()) {
        roomNode.roomTypeName = String(mapping.platformRoomTypeName || mapping.internalRoomTypeName || "").trim();
      }

      const formula = readStrategyFormula(roomNode.rawPayload && typeof roomNode.rawPayload === "object" ? roomNode.rawPayload : {}, mapping.platformChannel, mapping.rateCode);
      roomNode.strategies.push({
        ...mapping,
        ...formula,
        createdAt: mapping.createdAt.toISOString(),
        updatedAt: mapping.updatedAt.toISOString()
      });
    }

    return Array.from(hotelMap.values());
  },

  async getRoomMapping(params = {}) {
    const platform = normalizePlatform(params.platform || "");
    const platformHotelId = String(params.platformHotelId || "").trim();
    const platformRoomTypeId = String(params.platformRoomTypeId || "").trim();
    const platformChannel = String(params.platformChannel || "").trim().toUpperCase();
    const rateCode = String(params.rateCode || "").trim();
    const row = rateCode
      ? await prisma.otaRoomMapping.findFirst({
        where: {
          platform,
          platformHotelId,
          platformRoomTypeId,
          platformChannel: platformChannel || "DEFAULT",
          rateCode
        },
        orderBy: {
          updatedAt: "desc"
        }
      })
      : await prisma.otaRoomMapping.findFirst({
        where: {
          platform,
          platformHotelId,
          platformRoomTypeId,
          platformChannel: platformChannel || undefined,
          enabled: true
        },
        orderBy: {
          updatedAt: "desc"
        }
      });
    if (!row) {
      return null;
    }
    const room = await prisma.otaRoomType.findUnique({
      where: {
        platform_platformHotelId_platformRoomTypeId: {
          platform: row.platform,
          platformHotelId: row.platformHotelId,
          platformRoomTypeId: row.platformRoomTypeId
        }
      },
      select: {
        rawPayload: true
      }
    });
    const formula = readStrategyFormula(room?.rawPayload && typeof room.rawPayload === "object" ? room.rawPayload : {}, row.platformChannel, row.rateCode);
    return {
      ...row,
      ...formula,
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
    const platformHotelId = String(payload.platformHotelId || "").trim();
    const platformRoomTypeId = String(payload.platformRoomTypeId || "").trim();
    const date = toDateText(payload.date);
    const platformChannel = String(payload.platformChannel || "DEFAULT").trim().toUpperCase();
    const rateplanCode = String(payload.rateplanCode || payload.rateplan_code || "").trim();
    if (!platformHotelId || !platformRoomTypeId || !date) {
      throw new Error("platformHotelId, platformRoomTypeId and date are required");
    }
    if (!rateplanCode) {
      throw new Error("rateplanCode is required");
    }
    const baseCreate = {
        platform: normalizePlatform(payload.platform || ""),
        platformHotelId,
        platformRoomTypeId,
        date,
        price: Math.max(0, toInt(payload.price, 0)),
        inventory: Math.max(0, toInt(payload.inventory, 0)),
        currency: String(payload.currency || "CNY").trim().toUpperCase(),
        source: String(payload.source || "manual").trim().toUpperCase(),
        lastPushedAt: payload.lastPushedAt ? new Date(payload.lastPushedAt) : null
      };
    const updateData = {
        price: Math.max(0, toInt(payload.price, 0)),
        inventory: Math.max(0, toInt(payload.inventory, 0)),
        currency: String(payload.currency || "CNY").trim().toUpperCase(),
        source: String(payload.source || "manual").trim().toUpperCase(),
        lastPushedAt: payload.lastPushedAt ? new Date(payload.lastPushedAt) : undefined
      };

    let row;
    try {
      const existed = await prisma.otaCalendarItem.findFirst({
        where: {
          platform: normalizePlatform(payload.platform || ""),
          platformHotelId,
          platformRoomTypeId,
          platformChannel,
          rateplanCode,
          date
        },
        select: { id: true }
      });
      row = existed
        ? await prisma.otaCalendarItem.update({
          where: { id: existed.id },
          data: updateData
        })
        : await prisma.otaCalendarItem.create({
          data: {
            ...baseCreate,
            platformChannel,
            rateplanCode
          }
        });
    } catch (err) {
      throw err;
    }

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
        platformChannel: filters.platformChannel ? String(filters.platformChannel).trim().toUpperCase() : undefined,
        rateplanCode: filters.rateplanCode ? String(filters.rateplanCode).trim() : undefined,
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
