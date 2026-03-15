const mockHotels = [
  {
    platformHotelId: "FLG-3100001",
    hotelName: "上海静安测试酒店",
    city: "上海",
    status: "ONLINE",
    rooms: [
      { platformRoomTypeId: "R-STD-K", roomTypeName: "高级大床房", bedType: "KING" },
      { platformRoomTypeId: "R-STD-T", roomTypeName: "高级双床房", bedType: "TWIN" }
    ]
  },
  {
    platformHotelId: "FLG-4401009",
    hotelName: "广州珠江测试酒店",
    city: "广州",
    status: "ONLINE",
    rooms: [
      { platformRoomTypeId: "R-BIZ-K", roomTypeName: "商务大床房", bedType: "KING" }
    ]
  }
];

const mockRatePlans = [
  {
    platformHotelId: "FLG-3100001",
    platformRoomTypeId: "R-STD-K",
    rateplanCode: "RP-STD-K-BB",
    rateplanName: "标准含早",
    rpid: "RPID-STD-K-BB"
  },
  {
    platformHotelId: "FLG-3100001",
    platformRoomTypeId: "R-STD-T",
    rateplanCode: "RP-STD-T-BB",
    rateplanName: "标准双床含早",
    rpid: "RPID-STD-T-BB"
  },
  {
    platformHotelId: "FLG-4401009",
    platformRoomTypeId: "R-BIZ-K",
    rateplanCode: "RP-BIZ-K-BB",
    rateplanName: "商务含早",
    rpid: "RPID-BIZ-K-BB"
  }
];

const ok = (payload = {}) => ({ ok: true, ...payload });

const pickProduct = (payload = {}) => payload.product || payload;

const nowIso = () => new Date().toISOString();

const findHotel = (platformHotelId = "") => {
  const id = String(platformHotelId || "").trim();
  return mockHotels.find((hotel) => String(hotel.platformHotelId || "").trim() === id) || null;
};

const findRoom = ({ platformHotelId = "", platformRoomTypeId = "" } = {}) => {
  const roomId = String(platformRoomTypeId || "").trim();
  if (!roomId) {
    return null;
  }
  if (platformHotelId) {
    const hotel = findHotel(platformHotelId);
    const room = hotel?.rooms?.find((it) => String(it.platformRoomTypeId || "").trim() === roomId) || null;
    if (!room || !hotel) {
      return null;
    }
    return {
      platformHotelId: hotel.platformHotelId,
      room
    };
  }
  for (const hotel of mockHotels) {
    const room = hotel.rooms?.find((it) => String(it.platformRoomTypeId || "").trim() === roomId) || null;
    if (room) {
      return {
        platformHotelId: hotel.platformHotelId,
        room
      };
    }
  }
  return null;
};

const buildResponse = (operation, payload = {}) => ({
  mock: true,
  operation,
  requestId: `mock-${operation}-${Date.now()}`,
  timestamp: nowIso(),
  ...payload
});

export const fliggyMockAdapter = {
  platform: "FLIGGY",

  async fetchPublishedHotels() {
    return ok({
      hotels: mockHotels
    });
  },

  async fetchHotelByOuterId(payload = {}) {
    const product = pickProduct(payload);
    const platformHotelId = String(product.outer_id || product.outerId || product.platformHotelId || "").trim();
    if (!platformHotelId) {
      throw new Error("outer_id is required");
    }
    const hotel = findHotel(platformHotelId) || {
      platformHotelId,
      hotelName: platformHotelId,
      city: "",
      status: "OFFLINE",
      rooms: []
    };
    return ok({
      platformHotelId,
      hotel: {
        ...hotel,
        rawPayload: {
          source: "mock",
          hotel
        }
      },
      response: buildResponse("fetchHotelByOuterId", { platformHotelId })
    });
  },

  async fetchRoomTypeByOuterId(payload = {}) {
    const product = pickProduct(payload);
    const platformHotelId = String(product.hotel_outer_id || product.hotelOuterId || product.platformHotelId || "").trim();
    const platformRoomTypeId = String(
      product.room_outer_id || product.roomOuterId || product.outer_id || product.out_rid || product.outRid || product.platformRoomTypeId || ""
    ).trim();
    if (!platformRoomTypeId) {
      throw new Error("room outer_id is required");
    }
    const matched = findRoom({ platformHotelId, platformRoomTypeId });
    const resolvedHotelId = matched?.platformHotelId || platformHotelId;
    const room = matched?.room || {
      platformRoomTypeId,
      roomTypeName: platformRoomTypeId,
      bedType: ""
    };
    return ok({
      platformHotelId: resolvedHotelId,
      platformRoomTypeId,
      room: {
        ...room,
        outRid: String(room.outRid || platformRoomTypeId).trim(),
        rawPayload: {
          source: "mock",
          room
        }
      },
      response: buildResponse("fetchRoomTypeByOuterId", {
        platformHotelId: resolvedHotelId,
        platformRoomTypeId
      })
    });
  },

  async fetchRatePlanByCode(payload = {}) {
    const product = pickProduct(payload);
    const rateplanCode = String(product.rateplan_code || product.rateplanCode || "").trim();
    if (!rateplanCode) {
      throw new Error("rateplan_code is required");
    }
    const fallbackHotelId = String(product.platformHotelId || product.hotel_outer_id || product.outer_id || "").trim();
    const fallbackRoomId = String(product.platformRoomTypeId || product.room_outer_id || product.out_rid || product.outRid || "").trim();
    const rateplan =
      mockRatePlans.find((it) => String(it.rateplanCode || "").trim() === rateplanCode)
      || {
        platformHotelId: fallbackHotelId,
        platformRoomTypeId: fallbackRoomId,
        rateplanCode,
        rateplanName: rateplanCode,
        rpid: ""
      };
    return ok({
      rateplanCode,
      rateplan: {
        rateplanCode,
        rateplanName: rateplan.rateplanName,
        rpid: rateplan.rpid,
        status: "ONLINE",
        breakfastCount: 0,
        paymentType: "PREPAID",
        cancelPolicy: "",
        modifiedTime: nowIso(),
        rawPayload: {
          sourceResponse: buildResponse("fetchRatePlanByCode", { rateplanCode }),
          rateplan: {
            hid: rateplan.platformHotelId || fallbackHotelId,
            out_rid: rateplan.platformRoomTypeId || fallbackRoomId,
            rateplan_code: rateplanCode,
            rpid: rateplan.rpid
          }
        }
      },
      response: buildResponse("fetchRatePlanByCode", { rateplanCode })
    });
  },

  async upsertHotelProduct(payload = {}) {
    const product = pickProduct(payload);
    const platformHotelId = String(product.platformHotelId || product.outer_id || product.hid || product.hotel_id || "").trim();
    return ok({
      platformHotelId,
      response: buildResponse("upsertHotelProduct", { platformHotelId })
    });
  },

  async upsertRoomTypeProduct(payload = {}) {
    const product = pickProduct(payload);
    const platformHotelId = String(product.platformHotelId || product.hotel_outer_id || product.hid || product.hotel_id || "").trim();
    const platformRoomTypeId = String(
      product.platformRoomTypeId || product.room_outer_id || product.out_rid || product.outRid || product.outer_id || ""
    ).trim();
    return ok({
      platformHotelId,
      platformRoomTypeId,
      response: buildResponse("upsertRoomTypeProduct", {
        platformHotelId,
        platformRoomTypeId
      })
    });
  },

  async upsertRatePlanProduct(payload = {}) {
    const product = pickProduct(payload);
    const rateplanCode = String(product.rateplanCode || product.rateplan_code || "").trim();
    return ok({
      rateplanCode,
      response: buildResponse("upsertRatePlanProduct", { rateplanCode })
    });
  },

  async fetchRate(payload = {}) {
    const outRid = String(payload.outRid || payload.out_rid || "").trim();
    const rateplanCode = String(payload.rateplanCode || payload.rateplan_code || "").trim();
    const date = new Date();
    const inventoryCalendar = [0, 1, 2].map((offset) => {
      const current = new Date(date);
      current.setUTCDate(current.getUTCDate() + offset);
      return {
        date: current.toISOString().slice(0, 10),
        price: 399 + offset * 10,
        quota: 8 - offset
      };
    });
    return ok({
      rate: {
        out_rid: outRid,
        rateplan_code: rateplanCode
      },
      inventoryCalendar,
      response: buildResponse("fetchRate", {
        outRid,
        rateplanCode
      })
    });
  },

  async pushRateInventory(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return ok({
      acceptedCount: items.length,
      rejectedCount: 0,
      requestId: `mock-push-${Date.now()}`,
      items: items.map((it) => ({
        platformHotelId: String(it.platformHotelId || ""),
        platformRoomTypeId: String(it.platformRoomTypeId || ""),
        date: String(it.date || ""),
        price: Number(it.price) || 0,
        inventory: Math.max(0, Number(it.inventory) || 0),
        accepted: true
      }))
    });
  },

  async acknowledgeReservation(payload = {}) {
    return ok({
      externalOrderId: String(payload.externalOrderId || ""),
      reservationStatus: String(payload.reservationStatus || "CONFIRMED").toUpperCase(),
      acknowledgedAt: new Date().toISOString()
    });
  }
};
