import { createRequire } from "node:module";
import { env } from "../../config/env.js";

const require = createRequire(import.meta.url);
const { ApiClient } = require("../../../sdk/index.js");

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
  const platformHotelId = String(item.hid || item.hotel_id || item.hotelId || item.id || "").trim();
  if (!platformHotelId) {
    return null;
  }
  return {
    platformHotelId,
    hotelName: String(item.name || item.hotel_name || item.hotelName || platformHotelId).trim(),
    city: String(item.city || item.city_name || item.cityName || "").trim(),
    status: String(item.status || item.state || "ONLINE").trim().toUpperCase(),
    rawPayload: item
  };
};

const normalizeRoom = (item = {}) => {
  const platformRoomTypeId = String(item.out_rid || item.rid || item.room_type_id || item.roomTypeId || item.id || "").trim();
  if (!platformRoomTypeId) {
    return null;
  }
  return {
    platformRoomTypeId,
    roomTypeName: String(item.name || item.room_name || item.roomTypeName || platformRoomTypeId).trim(),
    bedType: String(item.bed_type || item.bedType || "").trim(),
    gid: String(item.gid || "").trim(),
    rpid: String(item.rpid || "").trim(),
    outRid: String(item.out_rid || item.outRid || platformRoomTypeId).trim(),
    rateplanCode: String(item.rateplan_code || item.rateplanCode || "").trim(),
    vendor: String(item.vendor || "").trim(),
    rawPayload: item
  };
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

const tryExecute = async (method, params = {}) => {
  try {
    return await execute(method, params);
  } catch {
    return null;
  }
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
        hotelMap.set(normalized.platformHotelId, {
          ...normalized,
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
          rawPayload: { hid: id },
          rooms: []
        });
      }
    }

    if (hotelMap.size > 0) {
      const hotelIds = Array.from(hotelMap.keys());
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
        const hid = hotel.platformHotelId;
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
        city: it.city,
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
    const response = await execute("taobao.xhotel.rate.update", {
      out_rid: payload.outRid,
      rateplan_code: payload.rateplanCode,
      vendor: payload.vendor || undefined,
      inventory_price: JSON.stringify({
        use_room_inventory: false,
        inventory_price: Array.isArray(payload.items)
          ? payload.items.map((it) => ({
            date: String(it.date || ""),
            quota: Math.max(0, Number(it.inventory) || 0),
            price: Math.max(0, Number(it.price) || 0)
          }))
          : []
      })
    });

    return {
      ok: true,
      response,
      gidAndRpid: response?.gid_and_rpid || null
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
