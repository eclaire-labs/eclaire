/**
 * API key generation and hashing for the CLI.
 * Mirrors the backend's api-key-security.ts logic.
 * Reads HMAC pepper from environment directly.
 */

import crypto from "node:crypto";
import { generateCleanId } from "@eclaire/core";
import { customAlphabet } from "nanoid";

const SECRET_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generateSecret = customAlphabet(SECRET_ALPHABET, 32);

function currentPepper(): { version: number; key: string } {
  const version = Number(process.env.API_KEY_HMAC_VERSION || "1");
  const key = process.env.API_KEY_HMAC_KEY_V1 || "";

  if (!key) {
    throw new Error(
      "Missing API_KEY_HMAC_KEY_V1 environment variable. " +
        "This is required for API key generation. " +
        "Check your .env file.",
    );
  }

  return { version, key };
}

function hmacBase64(secret: string, key: string): string {
  return crypto.createHmac("sha256", key).update(secret).digest("base64");
}

export function generateFullApiKey(): {
  fullKey: string;
  keyId: string;
  hash: string;
  hashVersion: number;
  suffix: string;
} {
  const keyId = generateCleanId();
  const secret = generateSecret();
  const fullKey = `sk-${keyId}-${secret}`;
  const suffix = secret.slice(-4);

  const { version, key: pepper } = currentPepper();
  const hash = hmacBase64(fullKey, pepper);

  return { fullKey, keyId, hash, hashVersion: version, suffix };
}

export function formatApiKeyForDisplay(keyId: string, suffix: string): string {
  return `sk-${keyId}-****${suffix}`;
}
