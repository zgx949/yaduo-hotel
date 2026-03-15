import { createRequire } from "node:module";
import { env } from "../../config/env.js";

const require = createRequire(import.meta.url);
const { ApiClient } = require("@ali/topSdk");

const nowText = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

const addHours = (date, hours) => {
  return new Date(date.getTime() + Number(hours || 0) * 60 * 60 * 1000);
};

const formatDateTime = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    return nowText();
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

const normalizeApiError = (error = {}) => {
  const err = new Error(error?.sub_msg || error?.msg || "taobao api request failed");
  err.code = error?.code || null;
  err.subCode = error?.sub_code || null;
  err.raw = error;
  return err;
};

const parseOrderRows = (response = {}) => {
  const wrapper = response?.hotel_orders || response?.hotelOrders || {};
  const rows = wrapper?.x_hotel_order || wrapper?.xHotelOrder || wrapper?.order || [];
  return Array.isArray(rows) ? rows : [];
};

const parseRateCalendar = (rate = {}) => {
  const inv = rate?.inv_price_with_switch || rate?.inventory_price || null;
  if (!inv) {
    return [];
  }
  if (Array.isArray(inv)) {
    return inv;
  }
  if (typeof inv === "string") {
    try {
      const parsed = JSON.parse(inv);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (Array.isArray(parsed?.inventory_price)) {
        return parsed.inventory_price;
      }
      return [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(inv?.inventory_price)) {
    return inv.inventory_price;
  }
  return [];
};

const pickArray = (...candidates) => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
};

const toArrayFromUnknown = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const keys = Object.keys(value);
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }
  return [];
};

const parseSellerHotelRows = (response = {}) => {
  const wrapper =
    response?.hotels ||
    response?.xhotel ||
    response?.hotel_list ||
    response?.hotelList ||
    response?.result ||
    response;
  return pickArray(
    wrapper?.x_hotel,
    wrapper?.hotel,
    wrapper?.hotels,
    wrapper?.items,
    toArrayFromUnknown(wrapper)
  );
};

const parseRoomRows = (response = {}) => {
  const wrapper = response?.rooms || response?.roomtypes || response?.room_type || response?.result || response;
  return pickArray(
    wrapper?.x_room_type,
    wrapper?.x_hotel_room,
    wrapper?.room,
    wrapper?.rooms,
    wrapper?.items,
    toArrayFromUnknown(wrapper)
  );
};

const normalizeHotel = (item = {}) => {
  const platformHotelId = String(item.outer_id || item.outerId || item.hid || item.hotel_id || item.hotelId || item.id || "").trim();
  if (!platformHotelId) {
    return null;
  }
  const basic = normalizeObject(item.s_hotel || item.sHotel || {});
  const hotelName = String(
    item.name || item.hotel_name || item.hotelName || basic.name || basic.hotel_name || basic.hotelName || platformHotelId
  ).trim();
  const cityId = String(item.city_id || item.cityId || basic.city_id || basic.cityId || "").trim();
  const city = String(item.city || item.city_name || item.cityName || basic.city || basic.city_name || basic.cityName || "").trim();
  const address = String(item.address || basic.address || "").trim();
  const tel = String(item.tel || item.phone || item.telephone || basic.tel || basic.phone || basic.telephone || "").trim();
  return {
    platformHotelId,
    hotelName,
    cityId,
    city,
    address,
    tel,
    status: normalizeStatus(item.status || item.state || "ONLINE"),
    rawPayload: item
  };
};

const normalizeRoom = (item = {}) => {
  const platformRoomTypeId = String(item.out_rid || item.outer_id || item.outerId || item.rid || item.room_type_id || item.roomTypeId || item.id || "").trim();
  if (!platformRoomTypeId) {
    return null;
  }
  const basic = normalizeObject(item.s_roomtype || item.sRoomtype || {});
  const bedInfo = item.bed_info || item.bedInfo || "";
  const bedJsonText = String(basic.bed || "").trim();
  let bedFromJson = "";
  if (bedJsonText) {
    try {
      const parsed = JSON.parse(bedJsonText);
      if (Array.isArray(parsed) && parsed.length > 0) {
        bedFromJson = String(parsed[0]?.bedType || parsed[0]?.type || "").trim();
      }
    } catch {
      bedFromJson = "";
    }
  }
  const bedType =
    String(item.bed_type || item.bedType || "").trim() ||
    (typeof bedInfo === "string" ? bedInfo.trim() : String(bedInfo?.name || bedInfo?.type || "").trim()) ||
    bedFromJson;
  return {
    platformRoomTypeId,
    roomTypeName: String(item.name || item.room_name || item.roomTypeName || basic.name || platformRoomTypeId).trim(),
    bedType,
    gid: String(item.gid || "").trim(),
    rpid: String(item.rpid || "").trim(),
    outRid: String(item.out_rid || item.outRid || platformRoomTypeId).trim(),
    rateplanCode: String(item.rateplan_code || item.rateplanCode || "").trim(),
    vendor: String(item.vendor || "").trim(),
    area: String(item.area || basic.area || "").trim(),
    floor: String(item.floor || basic.floor || "").trim(),
    maxOccupancy: Number(item.max_occupancy || basic.max_occupancy || 0) || null,
    windowType: String(item.window_type || basic.window_type || "").trim(),
    status: normalizeStatus(item.status || basic.status || "ONLINE"),
    rawPayload: item
  };
};

const normalizeStatus = (value) => {
  const text = String(value ?? "").trim();
  if (!text) {
    return "ONLINE";
  }
  if (text === "0") {
    return "ONLINE";
  }
  if (text === "1") {
    return "ONLINE";
  }
  if (text === "-1") {
    return "DELETED";
  }
  if (text === "-2") {
    return "OFFLINE";
  }
  const upper = text.toUpperCase();
  if (upper === "ONLINE" || upper === "DELETED" || upper === "OFFLINE") {
    return upper;
  }
  return upper;
};

const unwrapTopResponse = (response = {}) => {
  const keys = Object.keys(response || {});
  const wrapperKey = keys.find((key) => key.endsWith("_response") && response[key] && typeof response[key] === "object");
  if (!wrapperKey) {
    return response;
  }
  return normalizeObject(response[wrapperKey]);
};

const parseSingleHotel = (response = {}) => {
  const unwrapped = unwrapTopResponse(response);
  const item =
    unwrapped?.xhotel ||
    unwrapped?.x_hotel ||
    unwrapped?.s_hotel ||
    unwrapped?.hotel ||
    unwrapped?.result?.xhotel ||
    unwrapped?.result?.x_hotel ||
    unwrapped?.result?.s_hotel ||
    unwrapped?.result?.hotel ||
    unwrapped;
  return normalizeObject(item);
};

const parseSingleRoomType = (response = {}) => {
  const unwrapped = unwrapTopResponse(response);
  const item =
    unwrapped?.xroomtype ||
    unwrapped?.x_room_type ||
    unwrapped?.room_type ||
    unwrapped?.room ||
    unwrapped?.result?.xroomtype ||
    unwrapped?.result?.x_room_type ||
    unwrapped?.result?.room_type ||
    unwrapped?.result?.room ||
    unwrapped;
  return normalizeObject(item);
};

const inferHotelOuterIdFromRoomOuterId = (roomOuterId = "") => {
  const text = String(roomOuterId || "").trim();
  if (!text) {
    return "";
  }
  const idx = text.indexOf("_");
  if (idx <= 0) {
    return "";
  }
  return text.slice(0, idx).trim();
};

const splitChunks = (items = [], chunkSize = 20) => {
  const result = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    result.push(items.slice(i, i + chunkSize));
  }
  return result;
};

const parseBatchHotels = (response = {}) => {
  const wrapper = response?.x_hotels || response?.hotels || response?.result || response;
  return pickArray(
    wrapper?.x_hotel,
    wrapper?.hotel,
    wrapper?.items,
    toArrayFromUnknown(wrapper)
  );
};

const parseBatchRoomTypes = (response = {}) => {
  const wrapper = response?.x_room_types || response?.room_types || response?.rooms || response?.result || response;
  return pickArray(
    wrapper?.x_room_type,
    wrapper?.room_type,
    wrapper?.room,
    wrapper?.items,
    toArrayFromUnknown(wrapper)
  );
};

const parseBatchRatePlans = (response = {}) => {
  const wrapper = response?.rateplans || response?.x_rateplans || response?.result || response;
  return pickArray(
    wrapper?.rateplan,
    wrapper?.x_rateplan,
    wrapper?.items,
    toArrayFromUnknown(wrapper)
  );
};

const parseSingleRatePlan = (response = {}) => {
  const unwrapped = unwrapTopResponse(response);
  const item =
    unwrapped?.rateplan ||
    unwrapped?.x_rateplan ||
    unwrapped?.xRatePlan ||
    unwrapped?.result?.rateplan ||
    unwrapped?.result?.x_rateplan ||
    unwrapped;
  return normalizeObject(item);
};

const normalizeRatePlan = (item = {}) => {
  const rateplanCode = String(item.rateplan_code || item.rateplanCode || item.outer_id || "").trim();
  if (!rateplanCode) {
    return null;
  }
  return {
    rateplanCode,
    rateplanName: String(item.name || item.rateplan_name || item.rateplanName || rateplanCode).trim(),
    rpid: String(item.rpid || item.rp_id || item.rpId || "").trim(),
    status: String(item.status || "").trim(),
    breakfastCount: Number(item.breakfast_count || item.breakfastCount || 0) || 0,
    paymentType: String(item.payment_type || item.paymentType || "").trim(),
    cancelPolicy: typeof item.cancel_policy === "string" ? item.cancel_policy : JSON.stringify(item.cancel_policy || ""),
    modifiedTime: String(item.modified_time || item.modifiedTime || "").trim(),
    rawPayload: item
  };
};

const tryExecute = async (method, params = {}) => {
  try {
    return await execute(method, params);
  } catch {
    return null;
  }
};

const normalizeObject = (value) => {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value;
};

const buildClient = () => {
  if (!env.otaTopAppKey || !env.otaTopAppSecret) {
    throw new Error("OTA_TOP_APP_KEY and OTA_TOP_APP_SECRET are required");
  }
  return new ApiClient({
    appkey: env.otaTopAppKey,
    appsecret: env.otaTopAppSecret,
    url: env.otaTopUrl
  });
};

const execute = async (method, params = {}) => {
  const client = buildClient();
  const sessionKey =
    String(params?.session || params?.sessionKey || env.otaTopAssessToken || env.otaTopSession || "").trim();
  const payload = {
    ...params
  };
  delete payload.sessionKey;
  if (!payload.session && sessionKey) {
    payload.session = sessionKey;
  }
  if (!payload.vendor && env.otaTopVendor) {
    payload.vendor = env.otaTopVendor;
  }

  return new Promise((resolve, reject) => {
    client.execute(method, payload, (error, response) => {
      if (error) {
        reject(normalizeApiError(error));
        return;
      }
      resolve(response || {});
    });
  });
};

export const taobaoTopAdapter = {
  platform: "FLIGGY",

  async fetchHotelByOuterId(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const outerId = String(body.outer_id || body.outerId || body.platformHotelId || "").trim();
    if (!outerId) {
      throw new Error("outer_id is required");
    }
    const response = await execute("taobao.xhotel.get", {
      outer_id: outerId,
      hid: body.hid || undefined,
      need_sale_info: body.need_sale_info ?? true,
      vendor: body.vendor || undefined
    });
    const hotel = parseSingleHotel(response);
    const statusValue =
      hotel?.status ??
      hotel?.s_hotel?.status ??
      hotel?.sHotel?.status ??
      response?.status ??
      response?.xhotel_get_response?.xhotel?.status;
    const normalizedHotel = normalizeHotel({
      ...hotel,
      outer_id: outerId,
      status: statusValue
    });
    if (!normalizedHotel) {
      throw new Error(`hotel not found by outer_id: ${outerId}`);
    }
    return {
      ok: true,
      platformHotelId: outerId,
      hotel: {
        ...normalizedHotel,
        platformHotelId: outerId,
        status: normalizeStatus(statusValue),
        rawPayload: {
          sourceResponse: response,
          xhotel: hotel,
          s_hotel: normalizeObject(hotel?.s_hotel || hotel?.sHotel || {})
        }
      },
      response
    };
  },

  async fetchRoomTypeByOuterId(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const hotelOuterId = String(body.hotel_outer_id || body.platformHotelId || "").trim();
    const roomOuterId = String(
      body.room_outer_id || body.outer_id || body.out_rid || body.outRid || body.platformRoomTypeId || ""
    ).trim();
    if (!roomOuterId) {
      throw new Error("room outer_id is required");
    }

    const response = await execute("taobao.xhotel.roomtype.get", {
      outer_id: roomOuterId,
      rid: body.rid || undefined,
      vendor: body.vendor || undefined
    });

    const room = parseSingleRoomType(response);
    const normalizedRoom = normalizeRoom({
      ...room,
      out_rid: roomOuterId,
      outer_id: roomOuterId
    });
    if (!normalizedRoom) {
      throw new Error(`roomtype not found by out_rid: ${roomOuterId}`);
    }

    const normalizedHotelOuterId =
      String(hotelOuterId || room.hotel_outer_id || room.hotelOuterId || "").trim() ||
      inferHotelOuterIdFromRoomOuterId(roomOuterId);

    return {
      ok: true,
      platformHotelId: normalizedHotelOuterId,
      platformRoomTypeId: roomOuterId,
      room: {
        ...normalizedRoom,
        platformRoomTypeId: roomOuterId,
        outRid: roomOuterId,
        hid: String(room.hid || "").trim() || null,
        rawPayload: {
          ...room,
          response
        }
      },
      response
    };
  },

  async upsertHotelProduct(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const platformHotelId = String(body.platformHotelId || body.hid || body.hotel_id || body.outer_id || "").trim();
    const request = {
      ...body,
      hid: body.hid || body.hotel_id || undefined,
      outer_id: body.outer_id || platformHotelId || undefined,
      name: body.name || body.hotelName || undefined,
      city: body.city || undefined,
      address: body.address || undefined,
      tel: body.tel || body.phone || body.telephone || undefined,
      status: body.status || undefined,
      vendor: body.vendor || undefined
    };

    const response =
      (await tryExecute("taobao.xhotel.add", request)) ||
      (await execute("taobao.xhotel.update", request));

    return {
      ok: true,
      platformHotelId,
      response
    };
  },

  async deleteHotelProduct(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const platformHotelId = String(body.platformHotelId || body.hid || body.hotel_id || body.outer_id || "").trim();
    const response = await execute("taobao.xhotel.delete", {
      hid: body.hid || body.hotel_id || undefined,
      outer_id: body.outer_id || platformHotelId || undefined,
      vendor: body.vendor || undefined
    });
    return {
      ok: true,
      platformHotelId,
      response
    };
  },

  async upsertRoomTypeProduct(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const platformHotelId = String(body.platformHotelId || body.hid || body.hotel_id || "").trim();
    const platformRoomTypeId = String(
      body.platformRoomTypeId || body.outRid || body.out_rid || body.room_type_id || body.outer_id || ""
    ).trim();

    const request = {
      ...body,
      hid: body.hid || body.hotel_id || platformHotelId || undefined,
      out_rid: body.out_rid || body.outRid || platformRoomTypeId || undefined,
      outer_id: body.outer_id || platformRoomTypeId || undefined,
      name: body.name || body.roomTypeName || undefined,
      bed_type: body.bed_type || body.bedType || undefined,
      vendor: body.vendor || undefined
    };

    const response =
      (await tryExecute("taobao.xhotel.roomtype.add", request)) ||
      (await execute("taobao.xhotel.roomtype.update", request));

    return {
      ok: true,
      platformHotelId,
      platformRoomTypeId,
      response
    };
  },

  async deleteRoomTypeProduct(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const platformHotelId = String(body.platformHotelId || body.hid || body.hotel_id || "").trim();
    const platformRoomTypeId = String(
      body.platformRoomTypeId || body.outRid || body.out_rid || body.room_type_id || body.outer_id || ""
    ).trim();

    const response = await execute("taobao.xhotel.roomtype.delete.public", {
      hid: body.hid || body.hotel_id || undefined,
      out_rid: body.out_rid || body.outRid || platformRoomTypeId || undefined,
      outer_id: body.outer_id || platformHotelId || undefined,
      vendor: body.vendor || undefined
    });

    return {
      ok: true,
      platformHotelId,
      platformRoomTypeId,
      response
    };
  },

  async upsertRatePlanProduct(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const request = {
      ...body,
      hid: body.hid || body.hotel_id || body.platformHotelId || undefined,
      out_rid: body.out_rid || body.outRid || body.platformRoomTypeId || undefined,
      rateplan_code: body.rateplan_code || body.rateplanCode || undefined,
      name: body.name || body.rateplanName || undefined,
      vendor: body.vendor || undefined
    };

    const response =
      (await tryExecute("taobao.xhotel.rateplan.add", request)) ||
      (await execute("taobao.xhotel.rateplan.update", request));

    return {
      ok: true,
      rateplanCode: String(request.rateplan_code || "").trim(),
      response
    };
  },

  async fetchRatePlanByCode(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const rateplanCode = String(body.rateplan_code || body.rateplanCode || "").trim();
    if (!rateplanCode) {
      throw new Error("rateplan_code is required");
    }
    const response = await execute("taobao.xhotel.rateplan.get", {
      rateplan_code: rateplanCode,
      rpid: body.rpid || undefined,
      vendor: body.vendor || undefined
    });
    const rateplan = parseSingleRatePlan(response);
    const normalized = normalizeRatePlan({
      ...rateplan,
      rateplan_code: rateplanCode
    });
    if (!normalized) {
      throw new Error(`rateplan not found by rateplan_code: ${rateplanCode}`);
    }
    return {
      ok: true,
      rateplanCode,
      rateplan: {
        ...normalized,
        rawPayload: {
          sourceResponse: response,
          rateplan
        }
      },
      response
    };
  },

  async deleteRatePlanProduct(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const response = await execute("taobao.xhotel.rateplan.delete", {
      hid: body.hid || body.hotel_id || body.platformHotelId || undefined,
      out_rid: body.out_rid || body.outRid || body.platformRoomTypeId || undefined,
      rateplan_code: body.rateplan_code || body.rateplanCode || undefined,
      vendor: body.vendor || undefined
    });

    return {
      ok: true,
      rateplanCode: String(body.rateplanCode || body.rateplan_code || "").trim(),
      response
    };
  },

  async deleteRateProduct(payload = {}) {
    const body = normalizeObject(payload.product || payload);
    const response = await execute("taobao.xhotel.rate.delete", {
      gid: body.gid || undefined,
      rpid: body.rpid || undefined,
      out_rid: body.out_rid || body.outRid || body.platformRoomTypeId || undefined,
      rateplan_code: body.rateplan_code || body.rateplanCode || undefined,
      vendor: body.vendor || undefined
    });

    return {
      ok: true,
      response
    };
  },

  async fetchPublishedHotels(payload = {}) {
    const pageSize = Math.min(100, Math.max(1, Number(payload.pageSize) || 50));
    const maxPages = Math.min(10, Math.max(1, Number(payload.maxPages) || 3));

    const hotelMap = new Map();
    const responses = [];

    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const response =
        (await tryExecute("taobao.xhotel.batch.get", {
          page_no: pageNo,
          page_size: pageSize,
          status: payload.status || undefined,
          vendor: payload.vendor || undefined
        })) ||
        (await tryExecute("taobao.xhotel.seller.hotels.get", {
          page_no: pageNo,
          page_size: pageSize,
          status: payload.status || undefined,
          vendor: payload.vendor || undefined
        })) ||
        (await tryExecute("taobao.xhotel.baseinfos.get", {
          page_no: pageNo,
          page_size: pageSize,
          status: payload.status || undefined,
          vendor: payload.vendor || undefined
        }));

      if (!response) {
        break;
      }

      responses.push(response);
      const rows = pickArray(parseBatchHotels(response), parseSellerHotelRows(response));
      if (rows.length === 0) {
        if (pageNo === 1) {
          continue;
        }
        break;
      }

      for (const row of rows) {
        const normalized = normalizeHotel(row);
        if (!normalized) {
          continue;
        }
        const hid = String(row.hid || row.hotel_id || row.hotelId || normalized.platformHotelId || "").trim();
        const key = hid || normalized.platformHotelId;
        hotelMap.set(key, {
          ...normalized,
          __hid: hid || normalized.platformHotelId,
          rooms: []
        });
      }
    }

    if (hotelMap.size === 0 && Array.isArray(payload.hotelIds)) {
      for (const hid of payload.hotelIds) {
        const id = String(hid || "").trim();
        if (!id) {
          continue;
        }
        hotelMap.set(id, {
          platformHotelId: id,
          hotelName: id,
          city: "",
          status: "ONLINE",
          __hid: id,
          rawPayload: { hid: id },
          rooms: []
        });
      }
    }

    if (hotelMap.size > 0) {
      const hotelIds = Array.from(hotelMap.values()).map((it) => String(it.__hid || it.platformHotelId || "").trim()).filter(Boolean);
      const roomByHotel = new Map();
      const rateplansByHotel = new Map();

      for (const chunk of splitChunks(hotelIds, 20)) {
        const hids = chunk.join(",");

        for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
          const roomResponse =
            (await tryExecute("taobao.xhotel.roomtype.batch.get", {
              hids,
              page_no: pageNo,
              page_size: pageSize,
              vendor: payload.vendor || undefined
            })) ||
            (await tryExecute("taobao.xhotel.roomtypes.get", {
              hids,
              page_no: pageNo,
              page_size: pageSize,
              vendor: payload.vendor || undefined
            }));

          if (!roomResponse) {
            break;
          }
          const roomRows = pickArray(parseBatchRoomTypes(roomResponse), parseRoomRows(roomResponse));
          if (roomRows.length === 0) {
            break;
          }
          for (const roomRow of roomRows) {
            const hid = String(roomRow.hid || roomRow.hotel_id || roomRow.hotelId || "").trim();
            if (!hid) {
              continue;
            }
            if (!roomByHotel.has(hid)) {
              roomByHotel.set(hid, []);
            }
            const room = normalizeRoom(roomRow);
            if (room) {
              roomByHotel.get(hid).push(room);
            }
          }
        }

        const rateplanResponse =
          (await tryExecute("taobao.xhotel.rateplan.batch.get", {
            hids,
            vendor: payload.vendor || undefined
          })) ||
          (await tryExecute("taobao.xhotel.rateplans.get", {
            hids,
            vendor: payload.vendor || undefined
          }));

        const rateplanRows = parseBatchRatePlans(rateplanResponse || {});
        for (const rateplan of rateplanRows) {
          const hid = String(rateplan.hid || rateplan.hotel_id || rateplan.hotelId || "").trim();
          if (!hid) {
            continue;
          }
          if (!rateplansByHotel.has(hid)) {
            rateplansByHotel.set(hid, []);
          }
          rateplansByHotel.get(hid).push({
            rateplanCode: String(rateplan.outer_id || rateplan.rateplan_code || rateplan.rateplanCode || "").trim(),
            rpId: String(rateplan.rp_id || rateplan.rpid || "").trim(),
            rid: String(rateplan.rid || rateplan.out_rid || "").trim()
          });
        }
      }

      for (const hotel of hotelMap.values()) {
        const hid = String(hotel.__hid || hotel.platformHotelId || "").trim();
        const rooms = roomByHotel.get(hid) || [];
        const plans = rateplansByHotel.get(hid) || [];

        const mergedRooms = rooms.map((room) => {
          const matched = plans.find((it) => it.rid && (it.rid === room.platformRoomTypeId || it.rid === room.outRid));
          return {
            ...room,
            rpid: room.rpid || matched?.rpId || "",
            rateplanCode: room.rateplanCode || matched?.rateplanCode || ""
          };
        });

        if (mergedRooms.length === 0) {
          const roomResponse =
            (await tryExecute("taobao.xhotel.roomtypes.get", { hid })) ||
            (await tryExecute("taobao.xhotel.rooms.get", { hid })) ||
            (await tryExecute("taobao.xhotel.roomtype.get", { hid }));
          const roomRows = parseRoomRows(roomResponse || {});
          for (const roomRow of roomRows) {
            const room = normalizeRoom(roomRow);
            if (room) {
              mergedRooms.push(room);
            }
          }
        }

        hotel.rooms = mergedRooms;
      }
    }

    return {
      ok: true,
      hotels: Array.from(hotelMap.values()).map((it) => ({
        platformHotelId: it.platformHotelId,
        hotelName: it.hotelName,
        cityId: it.cityId || "",
        city: it.city,
        address: it.address || "",
        tel: it.tel || "",
        status: it.status,
        rooms: Array.isArray(it.rooms) ? it.rooms : [],
        rawPayload: it.rawPayload || {}
      })),
      response: responses[0] || null,
      source: "TOP_PRODUCT_LIBRARY"
    };
  },

  async fetchRate(params = {}) {
    const response = await execute("taobao.xhotel.rate.get", {
      gid: params.gid || undefined,
      rpid: params.rpid || undefined,
      out_rid: params.outRid || params.out_rid || undefined,
      rateplan_code: params.rateplanCode || params.rateplan_code || undefined,
      vendor: params.vendor || undefined
    });

    const rate = response?.rate || null;
    return {
      ok: true,
      rate,
      inventoryCalendar: parseRateCalendar(rate)
    };
  },

  async pushRateInventory(payload = {}) {
    const rateInventoryPriceMap = [
      {
        out_rid: payload.outRid,
        rateplan_code: payload.rateplanCode,
        vendor: payload.vendor || "",
        data: {
          use_room_inventory: false,
          inventory_price: Array.isArray(payload.items)
            ? payload.items.map((it) => ({
              date: String(it.date || ""),
              quota: Math.max(0, Number(it.inventory) || 0),
              price: Math.max(0, Math.round((Number(it.price) || 0) * 100))
            }))
            : []
        }
      }
    ];

    const response = await execute("taobao.xhotel.rates.update", {
      vendor: payload.vendor || undefined,
      rate_inventory_price_map: JSON.stringify(rateInventoryPriceMap)
    });

    const wrapper = response?.xhotel_rates_update_response || response || {};
    const gidAndRpids = Array.isArray(wrapper?.gid_and_rpids?.string)
      ? wrapper.gid_and_rpids.string
      : (Array.isArray(response?.gid_and_rpids?.string) ? response.gid_and_rpids.string : []);

    return {
      ok: true,
      response,
      gidAndRpid: gidAndRpids[0] || response?.gid_and_rpid || null,
      gidAndRpids
    };
  },

  async searchOrders(payload = {}) {
    const now = new Date();
    const createdEnd = payload.createdEnd || formatDateTime(now);
    const createdStart = payload.createdStart || formatDateTime(addHours(now, -Math.max(1, Number(payload.lookbackHours) || env.otaOrderPullLookbackHours)));

    const response = await execute("taobao.xhotel.order.search", {
      created_start: createdStart,
      created_end: createdEnd,
      page_no: Math.max(1, Number(payload.pageNo) || 1),
      trade_status: payload.tradeStatus || undefined,
      checkin_date_start: payload.checkInDateStart || undefined,
      checkin_date_end: payload.checkInDateEnd || undefined,
      checkout_date_start: payload.checkOutDateStart || undefined,
      checkout_date_end: payload.checkOutDateEnd || undefined,
      out_oids: payload.outOids || undefined,
      order_tids: payload.orderTids || undefined,
      order_ids: payload.orderIds || undefined,
      direct: payload.direct
    });

    return {
      ok: true,
      totalResults: Number(response?.total_results || 0),
      orders: parseOrderRows(response),
      response
    };
  },

  async confirmOrder(payload = {}) {
    const response = await execute("taobao.xhotel.order.update", {
      tid: payload.tid,
      opt_type: payload.optType || 2,
      confirm_code: payload.confirmCode || undefined,
      sync_to_hotel: payload.syncToHotel || undefined,
      reason_type: payload.reasonType || undefined,
      refund_fee: payload.refundFee || undefined,
      hotel_reverse_reason_code: payload.reverseReasonCode || undefined,
      hotel_reverse_reason_desc: payload.reverseReasonDesc || undefined,
      hotel_reverse_reason_detail: payload.reverseReasonDetail || undefined
    });

    return {
      ok: true,
      response
    };
  },

  async updateConfirmCode(payload = {}) {
    const response = await execute("taobao.xhotel.order.update.confirmcode", {
      param: {
        pms_res_id: String(payload.pmsResId || ""),
        tid: payload.tid,
        out_order_id: String(payload.outOrderId || "")
      }
    });

    return {
      ok: true,
      response
    };
  }
};
