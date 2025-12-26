import { createEncryption, parseEncryptionKey } from "@eclaire/core";
import { createChildLogger } from "./logger.js";
import { config } from "../config/index.js";

const logger = createChildLogger("encryption");

// In dev mode, encryption key may be auto-generated or absent
// Key validation is handled by the config system (required in production)
const masterKey = config.security.masterEncryptionKey;

// Parse the key if provided (will be undefined/null if not set in dev without .env)
const key = masterKey ? parseEncryptionKey(masterKey) : null;

// Create encryption service using @eclaire/core package (or null if no key)
const encryptionService = key ? createEncryption(key, { logger }) : null;

// Export functions for backward compatibility
// These will throw if encryption is not configured (no MASTER_ENCRYPTION_KEY)
export const encrypt = (plaintext: string): string => {
  if (!encryptionService) {
    throw new Error("Encryption not configured - MASTER_ENCRYPTION_KEY not set");
  }
  return encryptionService.encrypt(plaintext);
};

export const decrypt = (ciphertext: string): string => {
  if (!encryptionService) {
    throw new Error("Encryption not configured - MASTER_ENCRYPTION_KEY not set");
  }
  const result = encryptionService.decrypt(ciphertext);
  if (result === null) {
    throw new Error("Decryption failed - invalid ciphertext or corrupted data");
  }
  return result;
};

export const validateEncryptionService = (): void => {
  if (!encryptionService) {
    throw new Error("Encryption not configured - MASTER_ENCRYPTION_KEY not set");
  }
  encryptionService.validate();
};
