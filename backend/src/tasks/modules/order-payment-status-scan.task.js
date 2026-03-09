import { runUnpaidOrderPaymentStatusScan } from "../../services/order-status-sync.service.js";

export const orderPaymentStatusScanTask = async ({ payload }) => {
  return runUnpaidOrderPaymentStatusScan({ payload });
};
