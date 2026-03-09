import { runDailyCheckinTask } from "../../services/atour-maintenance.service.js";

export const accountDailyCheckinTask = async ({ proxy }) => {
  return runDailyCheckinTask({ proxy });
};
