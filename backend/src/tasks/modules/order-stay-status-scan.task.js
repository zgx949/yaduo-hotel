import { runPendingStayOrderStatusScan } from "../../services/order-status-sync.service.js";

export const orderStayStatusScanTask = async ({ payload }) => {
  return runPendingStayOrderStatusScan({ payload });
};
