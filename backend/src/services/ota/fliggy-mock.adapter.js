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

const ok = (payload = {}) => ({ ok: true, ...payload });

export const fliggyMockAdapter = {
  platform: "FLIGGY",

  async fetchPublishedHotels() {
    return ok({
      hotels: mockHotels
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
