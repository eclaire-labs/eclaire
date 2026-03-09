/**
 * Encryption helpers for the CLI.
 * Uses the same MASTER_ENCRYPTION_KEY as the backend.
 */

import { createEncryption, parseEncryptionKey } from "@eclaire/core";

let _encrypt: ((text: string) => string) | null = null;
let _decrypt: ((text: string) => string) | null = null;

function init() {
  if (_encrypt) return;

  const masterKey = process.env.MASTER_ENCRYPTION_KEY;
  if (!masterKey) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY not set. Ensure your .env file is configured.",
    );
  }

  const key = parseEncryptionKey(masterKey);
  const service = createEncryption(key);
  _encrypt = service.encrypt;
  _decrypt = (text: string) => {
    const result = service.decrypt(text);
    if (result === null) {
      throw new Error(
        "Decryption failed - invalid ciphertext or corrupted data",
      );
    }
    return result;
  };
}

export function encrypt(text: string): string {
  init();
  // biome-ignore lint/style/noNonNullAssertion: initialized above
  return _encrypt!(text);
}

export function decrypt(text: string): string {
  init();
  // biome-ignore lint/style/noNonNullAssertion: initialized above
  return _decrypt!(text);
}
