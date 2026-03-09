import { runDailyLotteryTask } from "../../services/atour-maintenance.service.js";

export const accountDailyLotteryTask = async ({ payload, proxy }) => {
  return runDailyLotteryTask({ payload, proxy });
};
