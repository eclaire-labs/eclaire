import https from "node:https";
import { eq, and } from "drizzle-orm";
import { db, schema } from "../../db/index.js";
import {
  decrypt,
  encrypt,
  isEncryptedValue,
  isEncryptionConfigured,
} from "../encryption.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("x-tokens");

/**
 * Decrypt a token value if it is encrypted (v1: prefix), otherwise return as-is.
 * Handles backward compatibility with existing plaintext tokens.
 */
function decryptToken(value: string): string {
  if (isEncryptionConfigured() && isEncryptedValue(value)) {
    return decrypt(value);
  }
  return value;
}

/**
 * Encrypt a token value if encryption is configured. Returns plaintext in dev
 * when MASTER_ENCRYPTION_KEY is not set.
 */
function encryptToken(value: string): string {
  if (isEncryptionConfigured() && !isEncryptedValue(value)) {
    return encrypt(value);
  }
  return value;
}

const X_TOKEN_ENDPOINT = "https://api.x.com/2/oauth2/token";
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export interface XTokenResult {
  accessToken: string;
  xUserId: string;
}

/**
 * Check if a user has linked their X (Twitter) account.
 */
export async function hasXConnection(userId: string): Promise<boolean> {
  const account = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.userId, userId),
        eq(schema.accounts.providerId, "twitter"),
      ),
    )
    .limit(1);

  return account.length > 0;
}

/**
 * Get a valid X API access token for a user. Returns null if the user
 * has not linked their X account or if the token cannot be refreshed.
 */
export async function getXTokenForUser(
  userId: string,
): Promise<XTokenResult | null> {
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.userId, userId),
        eq(schema.accounts.providerId, "twitter"),
      ),
    )
    .limit(1);

  const account = accounts[0];
  if (!account) {
    return null;
  }

  if (!account.accessToken) {
    logger.warn({ userId }, "X account linked but no access token stored");
    return null;
  }

  const accessToken = decryptToken(account.accessToken);

  // Check if token is still valid (with buffer)
  const now = Date.now();
  const expiresAt = account.accessTokenExpiresAt
    ? new Date(account.accessTokenExpiresAt).getTime()
    : 0;

  if (expiresAt > now + TOKEN_EXPIRY_BUFFER_MS) {
    return {
      accessToken,
      xUserId: account.accountId,
    };
  }

  // Token expired or about to expire — attempt refresh
  if (!account.refreshToken) {
    logger.warn(
      { userId },
      "X access token expired and no refresh token available",
    );
    return null;
  }

  const refreshToken = decryptToken(account.refreshToken);

  logger.info({ userId }, "Refreshing expired X access token");
  return refreshXToken(userId, account.id, refreshToken, account.accountId);
}

/**
 * Refresh an X API access token using the refresh token.
 */
async function refreshXToken(
  userId: string,
  accountId: string,
  refreshToken: string,
  xUserId: string,
): Promise<XTokenResult | null> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    logger.error("X_CLIENT_ID or X_CLIENT_SECRET not configured");
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString();

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );

    const response = await new Promise<{
      statusCode: number;
      // biome-ignore lint/suspicious/noExplicitAny: X API token response shape
      data: any;
    }>((resolve, reject) => {
      const url = new URL(X_TOKEN_ENDPOINT);
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${credentials}`,
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks: string[] = [];
          res.on("data", (chunk) => {
            chunks.push(chunk);
          });
          res.on("end", () => {
            const raw = chunks.join("");
            let parsed: unknown;
            try {
              parsed = JSON.parse(raw);
            } catch {
              reject(new Error(`Failed to parse token response: ${raw}`));
              return;
            }
            resolve({ statusCode: res.statusCode || 0, data: parsed });
          });
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    if (response.statusCode !== 200) {
      logger.error(
        {
          userId,
          statusCode: response.statusCode,
          error: response.data?.error,
          description: response.data?.error_description,
        },
        "X token refresh failed",
      );
      return null;
    }

    const {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: expiresIn,
    } = response.data;

    if (!newAccessToken) {
      logger.error({ userId }, "X token refresh returned no access token");
      return null;
    }

    // Update tokens in database (encrypt before writing since this bypasses Better Auth hooks)
    const expiresAt = new Date(Date.now() + (expiresIn || 7200) * 1000);
    await db
      .update(schema.accounts)
      .set({
        accessToken: encryptToken(newAccessToken),
        refreshToken: encryptToken(newRefreshToken || refreshToken), // X may or may not rotate the refresh token
        accessTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, accountId));

    logger.info({ userId }, "X access token refreshed successfully");
    return { accessToken: newAccessToken, xUserId };
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : String(error),
      },
      "X token refresh request failed",
    );
    return null;
  }
}
