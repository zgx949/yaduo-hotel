import { constants, privateDecrypt, publicEncrypt } from "node:crypto";
import { env } from "../config/env.js";

const toUtf8 = (value) => Buffer.from(value, "base64").toString("utf8");
const normalizePem = (raw) => String(raw || "").replace(/\\n/g, "\n").trim();
const looksLikeBase64 = (text) => /^[A-Za-z0-9+/=]+$/.test(text) && text.length % 4 === 0;

export const resolvePemFromEnvValue = (raw) => {
  const normalized = normalizePem(raw);
  if (!normalized) {
    return "";
  }
  if (normalized.includes("-----BEGIN")) {
    return normalized;
  }

  const compact = normalized.replace(/\s+/g, "");
  if (!looksLikeBase64(compact)) {
    return normalized;
  }

  try {
    const decoded = toUtf8(compact).trim();
    if (decoded.includes("-----BEGIN")) {
      return decoded;
    }
    return normalized;
  } catch {
    return normalized;
  }
};

const getPublicKey = () => resolvePemFromEnvValue(env.poolTokenPublicKey);
const getPrivateKey = () => resolvePemFromEnvValue(env.poolTokenPrivateKey);

export const encryptPoolToken = (plainToken) => {
  const token = String(plainToken || "").trim();
  if (!token) {
    throw new Error("token is required");
  }
  const publicKey = getPublicKey();
  if (!publicKey) {
    throw new Error("POOL_TOKEN_PUBLIC_KEY is missing");
  }
  const encrypted = publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from(token)
  );
  return encrypted.toString("base64");
};

export const decryptPoolToken = (cipherText) => {
  const payload = String(cipherText || "").trim();
  if (!payload) {
    return "";
  }
  const privateKey = getPrivateKey();
  if (!privateKey) {
    throw new Error("POOL_TOKEN_PRIVATE_KEY is missing");
  }
  const decrypted = privateDecrypt(
    {
      key: privateKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from(payload, "base64")
  );
  return decrypted.toString("utf8");
};
