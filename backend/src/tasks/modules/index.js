import { accountDailyCheckinTask } from "./account-daily-checkin.task.js";
import { accountDailyLotteryTask } from "./account-daily-lottery.task.js";
import { accountCouponScanTask } from "./account-coupon-scan.task.js";
import { accountPointsScanTask } from "./account-points-scan.task.js";
import { accountTokenRefreshTask } from "./account-token-refresh.task.js";
import { accountNewUserEligibilityTask } from "./account-new-user-eligibility.task.js";
import { orderCancelTask } from "./order-cancel.task.js";
import { orderPaymentStatusScanTask } from "./order-payment-status-scan.task.js";
import { orderPaymentLinkTask } from "./order-payment-link.task.js";
import { orderStayStatusScanTask } from "./order-stay-status-scan.task.js";
import { orderSubmitTask } from "./order-submit.task.js";
import { otaPriceInventoryPushTask } from "./ota-price-inventory-push.task.js";
import { otaOrderAutoSubmitTask } from "./ota-order-auto-submit.task.js";

export const builtinTaskModules = {
  "order.submit": orderSubmitTask,
  "order.cancel": orderCancelTask,
  "order.payment-link": orderPaymentLinkTask,
  "order.payment-status-scan": orderPaymentStatusScanTask,
  "order.stay-status-scan": orderStayStatusScanTask,
  "account.token-refresh": accountTokenRefreshTask,
  "account.daily-checkin": accountDailyCheckinTask,
  "account.daily-lottery": accountDailyLotteryTask,
  "account.points-scan": accountPointsScanTask,
  "account.coupon-scan": accountCouponScanTask,
  "account.new-user-eligibility": accountNewUserEligibilityTask,
  "ota.price-inventory-push": otaPriceInventoryPushTask,
  "ota.order-auto-submit": otaOrderAutoSubmitTask
};
