import { runNewUserEligibilityTask } from "../../services/atour-maintenance.service.js";

export const accountNewUserEligibilityTask = async ({ payload, proxy }) => {
  return runNewUserEligibilityTask({ payload, proxy });
};
