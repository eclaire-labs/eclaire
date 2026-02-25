import * as crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // For AES, this is always 16

export interface EncryptionService {
  /**
   * Encrypts a plaintext string using AES-256-GCM encryption
   * @param text - The plaintext to encrypt
   * @returns Encrypted string in format: v1:iv:authTag:encryptedData (all hex-encoded)
   */
  encrypt(text: string): string;

  /**
   * Decrypts an encrypted string using AES-256-GCM decryption
   * @param encryptedText - The encrypted text in format: v1:iv:authTag:encryptedData
   * @returns Decrypted plaintext string, or null if decryption fails
   */
  decrypt(encryptedText: string): string | null;

  /**
   * Validates that the encryption service is properly configured
   * @returns true if encryption service is ready
   */
  validate(): boolean;
}

export interface CreateEncryptionOptions {
  /**
   * Optional logger for error reporting
   */
  logger?: {
    error: (data: Record<string, unknown>, message: string) => void;
    info: (message: string) => void;
  };
}

/**
 * Creates an encryption service instance with the provided key
 * @param key - 32-byte encryption key (AES-256)
 * @param options - Optional configuration
 * @returns EncryptionService instance
 */
export function createEncryption(
  key: Buffer,
  options: CreateEncryptionOptions = {},
): EncryptionService {
  const { logger } = options;

  if (key.length !== 32) {
    throw new Error(
      `Encryption key must be 32 bytes (256 bits), got ${key.length} bytes`,
    );
  }

  function encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      const encrypted = Buffer.concat([
        cipher.update(text, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      // Return a single string containing all parts, separated by colons
      // Format: v1:iv:authTag:encryptedData (version prefix for future key rotation)
      return `v1:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
    } catch (error) {
      logger?.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Encryption failed",
      );
      throw new Error("Encryption failed");
    }
  }

  function decrypt(encryptedText: string): string | null {
    try {
      const parts = encryptedText.split(":");

      if (parts.length !== 4 || parts[0] !== "v1") {
        logger?.error(
          { error: "Invalid encrypted text format - expected v1:iv:tag:data" },
          "Decryption failed",
        );
        throw new Error("Invalid encrypted text format.");
      }

      const [, ivHex, authTagHex, encryptedHex] = parts;
      if (!ivHex || !authTagHex || !encryptedHex) {
        throw new Error("Invalid encrypted text format.");
      }

      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const encrypted = Buffer.from(encryptedHex, "hex");

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag); // Check for message integrity

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch (error) {
      logger?.error(
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

  function validate(): boolean {
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

      logger?.info("Encryption service validation passed");
      return true;
    } catch (error) {
      logger?.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Encryption service validation failed",
      );
      throw new Error("Encryption service validation failed");
    }
  }

  return { encrypt, decrypt, validate };
}

/**
 * Parses a hex-encoded encryption key from a string
 * @param hexKey - 64-character hex string representing 32 bytes
 * @returns Buffer suitable for createEncryption
 */
export function parseEncryptionKey(hexKey: string): Buffer {
  if (hexKey.length !== 64) {
    throw new Error(
      `Encryption key must be 64 hex characters (32 bytes), got ${hexKey.length} characters`,
    );
  }
  return Buffer.from(hexKey, "hex");
}
