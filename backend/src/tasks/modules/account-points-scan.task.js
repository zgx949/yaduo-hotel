import { runPointsScanTask } from "../../services/atour-maintenance.service.js";

export const accountPointsScanTask = async ({ payload, proxy }) => {
  return runPointsScanTask({ payload, proxy });
};
