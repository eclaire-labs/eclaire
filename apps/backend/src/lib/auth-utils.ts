import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { config } from "../config/index.js";
import { db, schema } from "../db/index.js";
import { parseApiKey, verifyApiKeyHash } from "./api-key-security.js";
import type { AuthPrincipal } from "./auth-principal.js";
import { ForbiddenError } from "./errors.js";
import { createChildLogger } from "./logger.js";
import { ensureHumanActorForUserId } from "./services/actors.js";
import {
  resolveApiKeyCredential,
  touchActorCredentialUsage,
} from "./services/actor-credentials.js";

const logger = createChildLogger("auth-utils");

/**
 * Check if a user's account is active (not suspended).
 * Returns false if the user is suspended or not found.
 */
async function isAccountActive(userId: string): Promise<boolean> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { accountStatus: true },
  });
  return user?.accountStatus !== "suspended";
}

/**
 * Verifies an API key and returns validation result with resolved principal fields
 * @param apiKey The API key to verify
 * @returns Object with isValid boolean and principal if valid
 */
export async function verifyApiKey(
  apiKey: string,
): Promise<{ isValid: boolean; principal: AuthPrincipal | null }> {
  try {
    const parsed = parseApiKey(apiKey);
    if (!parsed) {
      return { isValid: false, principal: null };
    }

    const { keyId } = parsed;
    const credential = await resolveApiKeyCredential(keyId ?? "");
    if (!credential) {
      return { isValid: false, principal: null };
    }

    const isValid = verifyApiKeyHash(
      apiKey,
      credential.keyHash,
      credential.hashVersion,
    );

    if (!isValid) {
      return { isValid: false, principal: null };
    }

    await touchActorCredentialUsage(credential.credentialId);

    return {
      isValid: true,
      principal: {
        actorId: credential.actorId,
        actorKind: credential.actorKind,
        ownerUserId: credential.ownerUserId,
        grantId: credential.grantId,
        grantedByActorId: credential.grantedByActorId,
        credentialId: credential.credentialId,
        authMethod: "api_key",
        scopes: credential.scopes,
      },
    };
  } catch (_error) {
    return { isValid: false, principal: null };
  }
}

/**
 * Gets the authenticated principal from Hono context, supporting both Better Auth sessions and API keys.
 * Session resolution is lazy — the DB is only hit if an API key isn't present.
 * Suspended users are rejected regardless of auth method.
 * @param c The Hono context
 * @returns The authenticated principal or null if not authenticated
 */
export async function getAuthenticatedPrincipal(
  c: Context,
): Promise<AuthPrincipal | null> {
  const authHeader = c.req.header("Authorization");
  const apiKey = authHeader?.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;

  const xApiKey = c.req.header("X-API-Key");
  const keyToVerify = apiKey || xApiKey;

  if (keyToVerify) {
    try {
      const { isValid, principal } = await verifyApiKey(keyToVerify);

      if (isValid && principal) {
        // Block suspended users
        if (!(await isAccountActive(principal.ownerUserId))) {
          return null;
        }
        return principal;
      }
    } catch (_error) {}
  }

  const resolveSession = c.get("resolveSession");
  if (resolveSession) {
    const session = await resolveSession();
    if (session?.user?.id) {
      // Block suspended users
      if (!(await isAccountActive(session.user.id))) {
        logger.debug(
          { userId: session.user.id, path: c.req.path },
          "Auth rejected: user account is suspended",
        );
        return null;
      }
      await ensureHumanActorForUserId(session.user.id);
      return {
        actorId: session.user.id,
        actorKind: "human",
        ownerUserId: session.user.id,
        grantId: null,
        grantedByActorId: null,
        credentialId: null,
        authMethod: "session",
        scopes: ["*"],
      };
    }
    logger.debug(
      {
        path: c.req.path,
        hasSession: session !== null,
        hasUser: !!session?.user,
      },
      "Session resolved but no valid user found",
    );
  } else {
    logger.debug(
      { path: c.req.path },
      "No resolveSession available in context",
    );
  }

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
        await ensureHumanActorForUserId(firstUser.id);
        logger.debug(
          "Localhost auth bypass: authenticating as first user (non-production only)",
        );
        return {
          actorId: firstUser.id,
          actorKind: "human",
          ownerUserId: firstUser.id,
          grantId: null,
          grantedByActorId: null,
          credentialId: null,
          authMethod: "localhost",
          scopes: ["*"],
        };
      }
      logger.debug("Localhost auth bypass: no users found in database");
    } else {
      logger.debug(
        { clientIP, path: c.req.path },
        "Localhost bypass skipped: non-local IP",
      );
    }
  }

  logger.warn(
    { path: c.req.path, method: c.req.method },
    "All auth methods failed — returning null principal",
  );
  return null;
}

/**
 * Gets the authenticated user ID from Hono context or throws an error
 * @param c The Hono context
 * @returns User ID if authenticated
 * @throws Error response if not authenticated
 */
export async function requireAuth(c: Context): Promise<string> {
  const principal = await getAuthenticatedPrincipal(c);
  if (!principal) {
    throw new Error("Unauthorized");
  }
  return principal.ownerUserId;
}

export async function getAuthenticatedUserId(
  c: Context,
): Promise<string | null> {
  const principal = await getAuthenticatedPrincipal(c);
  return principal?.ownerUserId ?? null;
}

/**
 * Asserts that the given user is an instance admin.
 * @throws ForbiddenError if the user is not an admin
 */
export async function assertInstanceAdmin(userId: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { isInstanceAdmin: true },
  });
  if (!user?.isInstanceAdmin) {
    throw new ForbiddenError("Instance admin access required");
  }
}
