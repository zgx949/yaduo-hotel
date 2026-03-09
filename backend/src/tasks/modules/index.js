import { accountDailyCheckinTask } from "./account-daily-checkin.task.js";
import { accountDailyLotteryTask } from "./account-daily-lottery.task.js";
import { accountCouponScanTask } from "./account-coupon-scan.task.js";
import { accountPointsScanTask } from "./account-points-scan.task.js";
import { accountTokenRefreshTask } from "./account-token-refresh.task.js";
import { orderCancelTask } from "./order-cancel.task.js";
import { orderPaymentLinkTask } from "./order-payment-link.task.js";
import { orderSubmitTask } from "./order-submit.task.js";

export const builtinTaskModules = {
  "order.submit": orderSubmitTask,
  "order.cancel": orderCancelTask,
  "order.payment-link": orderPaymentLinkTask,
  "account.token-refresh": accountTokenRefreshTask,
  "account.daily-checkin": accountDailyCheckinTask,
  "account.daily-lottery": accountDailyLotteryTask,
  "account.points-scan": accountPointsScanTask,
  "account.coupon-scan": accountCouponScanTask
};
