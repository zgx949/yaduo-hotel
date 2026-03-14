import { otaIntegrationService } from "../../services/ota-integration.service.js";

export const otaPriceInventoryPushTask = async ({ payload }) => {
  return otaIntegrationService.pushRateInventory({
    platform: payload?.platform || "FLIGGY",
    items: Array.isArray(payload?.items) ? payload.items : []
  });
};
