import { otaIntegrationService } from "../../services/ota-integration.service.js";

export const otaOrderAutoSubmitTask = async ({ payload }) => {
  const platform = payload?.platform || "FLIGGY";
  const externalOrderId = String(payload?.externalOrderId || "").trim();
  if (!externalOrderId) {
    throw new Error("externalOrderId is required");
  }

  return otaIntegrationService.createInternalOrderFromTemplate({
    platform,
    externalOrderId,
    executeNow: payload?.executeNow !== false
  });
};
