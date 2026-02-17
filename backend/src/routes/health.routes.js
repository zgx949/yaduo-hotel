import { Router } from "express";
import { env } from "../config/env.js";
import { resolvePemFromEnvValue } from "../services/token-crypto.service.js";

export const healthRoutes = Router();

const looksLikePem = (value, beginLabel, endLabel) => {
  const text = resolvePemFromEnvValue(value);
  if (!text) {
    return false;
  }
  return text.includes(beginLabel) && text.includes(endLabel);
};

healthRoutes.get("/health", (req, res) => {
  return res.json({
    ok: true,
    service: "skyhotel-agent-pro-backend",
    time: new Date().toISOString()
  });
});

healthRoutes.get("/health/keys", (req, res) => {
  const publicKeyConfigured = Boolean(String(env.poolTokenPublicKey || "").trim());
  const privateKeyConfigured = Boolean(String(env.poolTokenPrivateKey || "").trim());
  const publicKeyPemValid = looksLikePem(
    env.poolTokenPublicKey,
    "-----BEGIN PUBLIC KEY-----",
    "-----END PUBLIC KEY-----"
  );
  const privateKeyPemValid = looksLikePem(
    env.poolTokenPrivateKey,
    "-----BEGIN PRIVATE KEY-----",
    "-----END PRIVATE KEY-----"
  );

  return res.json({
    ok: true,
    encryption: {
      ready: publicKeyConfigured && privateKeyConfigured && publicKeyPemValid && privateKeyPemValid,
      publicKeyConfigured,
      privateKeyConfigured,
      publicKeyPemValid,
      privateKeyPemValid
    },
    time: new Date().toISOString()
  });
});
