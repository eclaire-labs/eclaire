import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { db, schema } from "../db/index.js";
import { parseApiKey, verifyApiKeyHash } from "./api-key-security.js";

const { apiKeys } = schema;

/**
 * Verifies an API key and returns validation result with user ID
 * @param apiKey The API key to verify
 * @returns Object with isValid boolean and userId if valid
 */
export async function verifyApiKey(
  apiKey: string,
): Promise<{ isValid: boolean; userId: string | null }> {
  try {
    // Parse the API key format: sk-{15chars}-{32chars}
    const parsed = parseApiKey(apiKey);
    if (!parsed) {
      return { isValid: false, userId: null };
    }

    const { keyId } = parsed;

    // Find the key record by keyId
    const keyRecord = await db.query.apiKeys.findFirst({
      // biome-ignore lint/style/noNonNullAssertion: guaranteed by regex match above
      where: and(eq(apiKeys.keyId, keyId!), apiKeys.isActive),
    });

    if (!keyRecord) {
      return { isValid: false, userId: null };
    }

    // Verify the hash using HMAC
    const isValid = verifyApiKeyHash(
      apiKey,
      keyRecord.keyHash,
      keyRecord.hashVersion,
    );

    if (!isValid) {
      return { isValid: false, userId: null };
    }

    // Update last used timestamp
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, keyRecord.id));

    return { isValid: true, userId: keyRecord.userId };
  } catch (_error) {
    return { isValid: false, userId: null };
  }
}

/**
 * Gets the authenticated user ID from Hono context, supporting both Better Auth sessions and API keys
 * @param c The Hono context
 * @returns The authenticated user ID or null if not authenticated
 */
export async function getAuthenticatedUserId(
  c: Context,
): Promise<string | null> {
  // First check if user is already set by session middleware (Better Auth)
  const user = c.get("user");

  if (user?.id) {
    return user.id;
  }

  // Check for API key in Authorization header
  const authHeader = c.req.header("Authorization");
  const apiKey = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  // Also check X-API-Key header as an alternative
  const xApiKey = c.req.header("X-API-Key");
  const keyToVerify = apiKey || xApiKey;

  if (keyToVerify) {
    try {
      const { isValid, userId } = await verifyApiKey(keyToVerify);

      if (isValid && userId) {
        return userId;
      }
    } catch (_error) {}
  }

  return null;
}

/**
 * Gets the authenticated user ID from Hono context or throws an error
 * @param c The Hono context
 * @returns User ID if authenticated
 * @throws Error response if not authenticated
 */
export async function requireAuth(c: Context): Promise<string> {
  const userId = await getAuthenticatedUserId(c);
  if (!userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}
