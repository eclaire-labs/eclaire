import { eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import { ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("services:user-preferences");

const { userPreferences } = schema;

export interface UserPreferencesData {
  ttsVoice?: string;
  autoSendSTT?: boolean;
  autoPlayTTS?: boolean;
  ttsSpeed?: number;
}

const KNOWN_PREF_KEYS = new Set<keyof UserPreferencesData>([
  "ttsVoice",
  "autoSendSTT",
  "autoPlayTTS",
  "ttsSpeed",
]);

const DEFAULT_PREFERENCES: UserPreferencesData = {
  ttsVoice: "",
  autoSendSTT: false,
  autoPlayTTS: false,
  ttsSpeed: 1.0,
};

function sanitize(input: Record<string, unknown>): UserPreferencesData {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!KNOWN_PREF_KEYS.has(key as keyof UserPreferencesData)) continue;

    switch (key) {
      case "ttsVoice":
        if (typeof value === "string") result[key] = value;
        break;
      case "autoSendSTT":
      case "autoPlayTTS":
        if (typeof value === "boolean") result[key] = value;
        break;
      case "ttsSpeed":
        if (typeof value === "number" && value >= 0.5 && value <= 1.5) {
          result[key] = value;
        }
        break;
    }
  }
  return result as UserPreferencesData;
}

/**
 * Fetch user preferences, merged with defaults.
 */
export async function getUserPreferences(
  userId: string,
): Promise<UserPreferencesData> {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  if (!row) {
    return { ...DEFAULT_PREFERENCES };
  }

  const stored =
    typeof row.preferences === "string"
      ? JSON.parse(row.preferences)
      : row.preferences;

  return { ...DEFAULT_PREFERENCES, ...sanitize(stored) };
}

/**
 * Upsert user preferences, merging updates into existing values.
 */
export async function setUserPreferences(
  userId: string,
  updates: Record<string, unknown>,
): Promise<UserPreferencesData> {
  const validUpdates = sanitize(updates);

  if (Object.keys(validUpdates).length === 0) {
    throw new ValidationError(
      "No valid preference keys provided. Valid keys: " +
        [...KNOWN_PREF_KEYS].join(", "),
    );
  }

  // Read existing to merge
  const existing = await getUserPreferences(userId);
  const merged = { ...existing, ...validUpdates };

  await db
    .insert(userPreferences)
    .values({
      userId,
      preferences: merged,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        preferences: merged,
        updatedAt: new Date(),
      },
    });

  logger.info(
    { userId, keys: Object.keys(validUpdates) },
    "Updated user preferences",
  );

  return merged;
}
