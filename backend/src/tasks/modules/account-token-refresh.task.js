import { runTokenRefreshTask } from "../../services/atour-maintenance.service.js";

export const accountTokenRefreshTask = async ({ payload, proxy }) => {
  return runTokenRefreshTask({ payload, proxy });
};
