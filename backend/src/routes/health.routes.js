import { Router } from "express";
import { env } from "../config/env.js";
import {
  decryptPoolToken,
  encryptPoolToken,
  resolvePemFromEnvValue
} from "../services/token-crypto.service.js";

export const healthRoutes = Router();
const isDevelopment = env.nodeEnv === "development";

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

if (isDevelopment) {
  healthRoutes.get("/health/crypto", (req, res) => {
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
        algorithm: "RSA-OAEP",
        oaepHash: "sha256",
        inputEncoding: "utf8",
        outputEncoding: "base64",
        keyFormat: "PEM",
        ready: publicKeyConfigured && privateKeyConfigured && publicKeyPemValid && privateKeyPemValid,
        publicKeyConfigured,
        privateKeyConfigured,
        publicKeyPemValid,
        privateKeyPemValid
      },
      time: new Date().toISOString()
    });
  });

  healthRoutes.post("/health/crypto/test", (req, res) => {
    const { plainText, cipherText } = req.body || {};
    const normalizedPlainText = String(plainText || "");
    const normalizedCipherText = String(cipherText || "").trim();

    if (!normalizedPlainText && !normalizedCipherText) {
      return res.status(400).json({ message: "plainText or cipherText is required" });
    }

    const result = {
      algorithm: "RSA-OAEP",
      oaepHash: "sha256",
      inputEncoding: "utf8",
      outputEncoding: "base64",
      plainText: normalizedPlainText || undefined,
      cipherText: normalizedCipherText || undefined,
      encryptedText: undefined,
      decryptedText: undefined,
      roundTripOk: undefined,
      errors: []
    };

    if (normalizedPlainText) {
      try {
        const encrypted = encryptPoolToken(normalizedPlainText);
        result.encryptedText = encrypted;
        const decryptedRoundTrip = decryptPoolToken(encrypted);
        result.roundTripOk = decryptedRoundTrip === normalizedPlainText;
      } catch (err) {
        result.errors.push(`encrypt failed: ${err.message || "unknown error"}`);
      }
    }

    if (normalizedCipherText) {
      try {
        result.decryptedText = decryptPoolToken(normalizedCipherText);
      } catch (err) {
        result.errors.push(`decrypt failed: ${err.message || "unknown error"}`);
      }
    }

    return res.status(result.errors.length ? 400 : 200).json(result);
  });
}
