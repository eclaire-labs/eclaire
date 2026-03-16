/**
 * Instance settings CRUD for the CLI.
 * Direct database access using Drizzle ORM.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./index.js";

export const KNOWN_SETTINGS_KEYS: Record<string, "string" | "boolean"> = {
  "audio.defaultSttModel": "string",
  "audio.defaultTtsModel": "string",
  "audio.defaultTtsVoice": "string",
  "instance.registrationEnabled": "boolean",
};

// biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type
function query(): { db: any; instanceSettings: any } {
  const { db, schema } = getDb();
  return { db, instanceSettings: schema.instanceSettings };
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const { db, instanceSettings } = query();
  const rows: { key: string; value: string }[] = await db
    .select()
    .from(instanceSettings);

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}

export async function getSetting(key: string): Promise<unknown> {
  const { db, instanceSettings } = query();
  const rows = await db
    .select()
    .from(instanceSettings)
    .where(eq(instanceSettings.key, key))
    .limit(1);

  if (rows.length === 0) return undefined;
  try {
    return JSON.parse(rows[0].value);
  } catch {
    return rows[0].value;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const { db, instanceSettings } = query();
  const serialized = JSON.stringify(value);

  await db
    .insert(instanceSettings)
    .values({
      key,
      value: serialized,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: instanceSettings.key,
      set: {
        value: serialized,
        updatedAt: new Date(),
      },
    });
}

/**
 * Parse a string value based on the expected setting type.
 */
export function parseSettingValue(key: string, rawValue: string): unknown {
  const type = KNOWN_SETTINGS_KEYS[key];
  if (type === "boolean") {
    const lower = rawValue.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "no") return false;
    throw new Error(
      `Invalid boolean value "${rawValue}". Use true/false, 1/0, or yes/no.`,
    );
  }
  return rawValue;
}
