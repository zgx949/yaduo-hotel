import { otaIntegrationService } from "../../services/ota-integration.service.js";

export const otaRackRateSyncTask = async ({ payload }) => {
  return otaIntegrationService.syncCalendarFromRackRates({
    platform: payload?.platform || "FLIGGY",
    date: payload?.date,
    days: payload?.days,
    platformHotelId: payload?.platformHotelId,
    platformRoomTypeId: payload?.platformRoomTypeId,
    platformChannel: payload?.platformChannel,
    rateplanCode: payload?.rateplanCode,
    clearOutOfRange: payload?.clearOutOfRange ?? true
  });
};
