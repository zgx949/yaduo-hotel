import { runCouponScanTask } from "../../services/atour-maintenance.service.js";

export const accountCouponScanTask = async ({ payload, proxy }) => {
  return runCouponScanTask({ payload, proxy });
};
