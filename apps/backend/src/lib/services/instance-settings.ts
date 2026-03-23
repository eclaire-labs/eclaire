import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("services:instance-settings");

const { instanceSettings } = schema;

/**
 * Known instance setting keys and their descriptions.
 */
export const KNOWN_SETTINGS_KEYS = {
  "audio.defaultSttModel": "string",
  "audio.defaultTtsModel": "string",
  "audio.defaultTtsVoice": "string",
  "audio.defaultSttProvider": "string",
  "audio.defaultTtsProvider": "string",
  "audio.useStreamingStt": "boolean",
  "audio.useStreamingTts": "boolean",
  "instance.registrationEnabled": "boolean",
} as const;

type SettingsKey = keyof typeof KNOWN_SETTINGS_KEYS;

/**
 * Keys that are safe for any authenticated user to read.
 * These are runtime defaults that the frontend needs for preferences composition.
 */
export const PUBLIC_SETTINGS_KEYS: SettingsKey[] = [
  "audio.defaultSttModel",
  "audio.defaultTtsModel",
  "audio.defaultTtsVoice",
  "audio.defaultSttProvider",
  "audio.defaultTtsProvider",
  "audio.useStreamingStt",
  "audio.useStreamingTts",
];

function validateKey(key: string): asserts key is SettingsKey {
  if (!(key in KNOWN_SETTINGS_KEYS)) {
    throw new ValidationError(
      `Unknown instance setting key: "${key}". Valid keys: ${Object.keys(KNOWN_SETTINGS_KEYS).join(", ")}`,
      "key",
    );
  }
}

/**
 * Fetch all instance settings as a key-value object with parsed JSON values.
 */
export async function getAllInstanceSettings(): Promise<
  Record<string, unknown>
> {
  const rows = await db.select().from(instanceSettings);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      logger.warn(
        { key: row.key },
        "Failed to parse instance setting value as JSON, using raw string",
      );
      result[row.key] = row.value;
    }
  }
  return result;
}

/**
 * Fetch only public (non-sensitive) instance settings safe for any authenticated user.
 */
export async function getPublicInstanceDefaults(): Promise<
  Record<string, unknown>
> {
  const all = await getAllInstanceSettings();
  const result: Record<string, unknown> = {};
  for (const key of PUBLIC_SETTINGS_KEYS) {
    if (key in all) {
      result[key] = all[key];
    }
  }
  return result;
}

/**
 * Fetch a single instance setting by key. Returns the parsed JSON value or null if not found.
 */
export async function getInstanceSetting(key: string): Promise<unknown> {
  const [row] = await db
    .select()
    .from(instanceSettings)
    .where(eq(instanceSettings.key, key));

  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    logger.warn(
      { key },
      "Failed to parse instance setting value as JSON, using raw string",
    );
    return row.value;
  }
}

/**
 * Set a single instance setting. Validates the key against known keys and upserts the value.
 */
export async function setInstanceSetting(
  key: string,
  value: unknown,
  updatedBy?: string,
): Promise<void> {
  validateKey(key);

  await db
    .insert(instanceSettings)
    .values({
      key,
      value: JSON.stringify(value),
      updatedBy: updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: instanceSettings.key,
      set: {
        value: JSON.stringify(value),
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      },
    });

  logger.info({ key, updatedBy }, "Updated instance setting");
}

/**
 * Batch upsert multiple instance settings. Validates all keys before writing.
 */
export async function setInstanceSettings(
  updates: Record<string, unknown>,
  updatedBy?: string,
): Promise<void> {
  const keys = Object.keys(updates);
  if (keys.length === 0) return;

  // Validate all keys first
  for (const key of keys) {
    validateKey(key);
  }

  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(instanceSettings)
      .values({
        key,
        value: JSON.stringify(value),
        updatedBy: updatedBy ?? null,
      })
      .onConflictDoUpdate({
        target: instanceSettings.key,
        set: {
          value: JSON.stringify(value),
          updatedAt: new Date(),
          updatedBy: updatedBy ?? null,
        },
      });
  }

  logger.info({ keys, updatedBy }, "Updated instance settings");
}
