import { Router } from "express";

export const healthRoutes = Router();

healthRoutes.get("/health", (req, res) => {
  return res.json({
    ok: true,
    service: "skyhotel-agent-pro-backend",
    time: new Date().toISOString()
  });
});
