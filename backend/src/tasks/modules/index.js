import { accountDailyCheckinTask } from "./account-daily-checkin.task.js";
import { orderCancelTask } from "./order-cancel.task.js";
import { orderPaymentLinkTask } from "./order-payment-link.task.js";
import { orderSubmitTask } from "./order-submit.task.js";

export const builtinTaskModules = {
  "order.submit": orderSubmitTask,
  "order.cancel": orderCancelTask,
  "order.payment-link": orderPaymentLinkTask,
  "account.daily-checkin": accountDailyCheckinTask
};
