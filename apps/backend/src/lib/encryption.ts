import { createEncryption, parseEncryptionKey } from "@eclaire/core";
import { createChildLogger } from "./logger";

const logger = createChildLogger("encryption");

if (!process.env.MASTER_ENCRYPTION_KEY) {
  logger.error("MASTER_ENCRYPTION_KEY environment variable is not set");
  throw new Error("MASTER_ENCRYPTION_KEY environment variable is required");
}

// Key validation is handled at startup in env-validation.ts
const key = parseEncryptionKey(process.env.MASTER_ENCRYPTION_KEY);

// Create encryption service using @eclaire/core package
const encryptionService = createEncryption(key, { logger });

// Export functions for backward compatibility
export const encrypt = encryptionService.encrypt;
export const decrypt = encryptionService.decrypt;
export const validateEncryptionService = encryptionService.validate;
