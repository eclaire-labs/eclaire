import { createChildLogger } from "./logger";

const logger = createChildLogger("encryption");

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // For AES, this is always 16

if (!process.env.MASTER_ENCRYPTION_KEY) {
  logger.error("MASTER_ENCRYPTION_KEY environment variable is not set");
  throw new Error("MASTER_ENCRYPTION_KEY environment variable is required");
}

// Key validation is handled at startup in env-validation.ts

const KEY = Buffer.from(process.env.MASTER_ENCRYPTION_KEY, "hex"); // Key must be 32 bytes (64 hex characters)

/**
 * Encrypts a plaintext string using AES-256-GCM encryption
 * @param text - The plaintext to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all hex-encoded)
 */
export function encrypt(text: string): string {
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Return a single string containing all parts, separated by colons
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Encryption failed",
    );
    throw new Error("Encryption failed");
  }
}

/**
 * Decrypts an encrypted string using AES-256-GCM decryption
 * @param encryptedText - The encrypted text in format: iv:authTag:encryptedData
 * @returns Decrypted plaintext string, or null if decryption fails
 */
export function decrypt(encryptedText: string): string | null {
  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(":");

    if (!ivHex || !authTagHex || !encryptedHex) {
      logger.error("Invalid encrypted text format - missing components");
      throw new Error("Invalid encrypted text format.");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag); // Check for message integrity

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        encryptedTextLength: encryptedText?.length || 0,
      },
      "Decryption failed. The data may be corrupt or the key is wrong.",
    );
    // Return null to prevent using corrupted data
    return null;
  }
}

/**
 * Validates that the encryption service is properly configured
 * @returns true if encryption service is ready, throws error otherwise
 */
export function validateEncryptionService(): boolean {
  try {
    // Test encryption/decryption with a known value
    const testValue = "test-encryption-service";
    const encrypted = encrypt(testValue);
    const decrypted = decrypt(encrypted);

    if (decrypted !== testValue) {
      throw new Error(
        "Encryption service validation failed - decrypted value does not match",
      );
    }

    logger.info("Encryption service validation passed");
    return true;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Encryption service validation failed",
    );
    throw new Error("Encryption service validation failed");
  }
}
