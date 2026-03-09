import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { config } from "../config/index.js";
import { db, schema } from "../db/index.js";
import { parseApiKey, verifyApiKeyHash } from "./api-key-security.js";
import { createChildLogger } from "./logger.js";

const logger = createChildLogger("auth-utils");

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
 * Gets the authenticated user ID from Hono context, supporting both Better Auth sessions and API keys.
 * Session resolution is lazy — the DB is only hit if an API key isn't present.
 * @param c The Hono context
 * @returns The authenticated user ID or null if not authenticated
 */
export async function getAuthenticatedUserId(
  c: Context,
): Promise<string | null> {
  // Check for API key first (avoids session DB hit for programmatic clients)
  const authHeader = c.req.header("Authorization");
  const apiKey = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

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

  // Fall back to session auth (lazy — resolves session from DB only when needed)
  const resolveSession = c.get("resolveSession");
  if (resolveSession) {
    const session = await resolveSession();
    if (session?.user?.id) {
      return session.user.id;
    }
  }

  // Allow unauthenticated localhost requests (self-hosted convenience, non-production only).
  // Only triggers when both API key and session auth fail.
  if (!config.isProduction) {
    const clientIP =
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      (c.env as Record<string, unknown>)?.ip;
    const isLocalhost =
      !clientIP ||
      clientIP === "127.0.0.1" ||
      clientIP === "::1" ||
      clientIP === "::ffff:127.0.0.1" ||
      clientIP === "localhost";

    if (isLocalhost) {
      const firstUser = await db.query.users.findFirst();
      if (firstUser) {
        logger.debug("Localhost auth bypass: authenticating as first user (non-production only)");
        return firstUser.id;
      }
    }
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
