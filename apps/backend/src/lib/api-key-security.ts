import crypto from "node:crypto";
import { customAlphabet } from "nanoid";
import { generateCleanId } from "@eclaire/core";
import { createChildLogger } from "./logger";

const logger = createChildLogger("api-key-security");

const SECRET_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generateSecret = customAlphabet(SECRET_ALPHABET, 32);

function currentPepper() {
  const version = Number(process.env.API_KEY_HMAC_VERSION ?? "1");
  const key = process.env[`API_KEY_HMAC_KEY_V${version}`];

  if (!key) {
    throw new Error("Missing HMAC pepper key");
  }

  // Key validation is handled at startup in env-validation.ts

  return { version, key };
}

export function hmacBase64(secret: string, key: string) {
  return crypto.createHmac("sha256", key).update(secret).digest("base64");
}

export function generateFullApiKey() {
  const keyId = generateCleanId(); // 15 chars
  const secret = generateSecret(); // 32 chars
  const fullKey = `sk-${keyId}-${secret}`;
  const suffix = secret.slice(-4);

  const { version, key: pepper } = currentPepper();
  const hash = hmacBase64(fullKey, pepper);

  return { fullKey, keyId, hash, hashVersion: version, suffix };
}

export function verifyApiKeyHash(
  apiKey: string,
  hash: string,
  version: number,
) {
  const key = process.env[`API_KEY_HMAC_KEY_V${version}`];
  if (!key) return false;
  return hmacBase64(apiKey, key) === hash;
}

export function formatApiKeyForDisplay(keyId: string, suffix: string) {
  return `sk-${keyId}-****${suffix}`;
}

export function parseApiKey(apiKey: string) {
  const match = apiKey.match(/^sk-([A-Za-z0-9]{15})-([A-Za-z0-9]{32})$/);
  if (!match) return null;

  const [, keyId, secret] = match;
  return { keyId, secret };
}
