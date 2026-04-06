// lib/auth.ts

import { generateSecurityId, generateUserId } from "@eclaire/core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twitter } from "better-auth/social-providers";
import { config } from "../config/index.js";
import { db, dbType, schema } from "../db/index.js"; // Your drizzle database instance and conditional schema
import {
  encrypt,
  isEncryptedValue,
  isEncryptionConfigured,
} from "./encryption.js";
import { createChildLogger } from "./logger.js";
import { deleteQueueJobsByUserId } from "./services/user-data.js";

const logger = createChildLogger("auth");

if (
  !db ||
  !schema ||
  !schema.users ||
  !schema.sessions ||
  !schema.accounts ||
  !schema.verifications
) {
  throw new Error("DB or schema not properly loaded for Drizzle adapter.");
}

const provider = dbType === "sqlite" ? "sqlite" : "pg";

logger.info({ dbType, provider }, "Configuring Drizzle adapter");

const initializedAdapter = drizzleAdapter(db, {
  provider,
  schema: {
    user: schema.users,
    session: schema.sessions,
    account: schema.accounts,
    verification: schema.verifications,
  },
});

/**
 * For each URL, if it uses localhost or 127.0.0.1, emit both variants
 * so Better Auth's exact-match origin check accepts either.
 */
/**
 * Build social providers config. X (Twitter) is only enabled when
 * X_CLIENT_ID and X_CLIENT_SECRET are both set. Users cannot sign up
 * via Twitter — they must have an existing account and link it.
 */
function buildSocialProviders() {
  // biome-ignore lint/suspicious/noExplicitAny: Better Auth social provider config is dynamically constructed
  const providers: Record<string, any> = {};

  if (process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET) {
    providers.twitter = twitter({
      clientId: process.env.X_CLIENT_ID,
      clientSecret: process.env.X_CLIENT_SECRET,
      // bookmark.read: needed for bookmarks sync; offline.access: needed for refresh tokens
      scope: ["tweet.read", "users.read", "bookmark.read", "offline.access"],
      disableSignUp: true, // Only allow linking to existing accounts, not sign-up
    });
  }

  return Object.keys(providers).length > 0 ? providers : undefined;
}

function localhostVariants(urls: string[]): string[] {
  const set = new Set<string>();
  for (const url of urls) {
    set.add(url);
    if (url.includes("localhost")) {
      set.add(url.replace("localhost", "127.0.0.1"));
    } else if (url.includes("127.0.0.1")) {
      set.add(url.replace("127.0.0.1", "localhost"));
    }
  }
  return [...set];
}

/**
 * Encrypt token fields on an account record before it is written to the DB.
 * Returns the (possibly mutated) account. No-ops when encryption is not
 * configured (dev without MASTER_ENCRYPTION_KEY) or fields are already encrypted.
 */
function encryptAccountTokens<T extends Record<string, unknown>>(
  account: T,
): T {
  if (!isEncryptionConfigured()) return account;

  const tokenFields = ["accessToken", "refreshToken", "idToken"] as const;

  // biome-ignore lint/suspicious/noExplicitAny: mutating a generic record
  const out: any = { ...account };
  for (const field of tokenFields) {
    const value = out[field];
    if (
      typeof value === "string" &&
      value.length > 0 &&
      !isEncryptedValue(value)
    ) {
      out[field] = encrypt(value);
    }
  }
  return out as T;
}

export const auth = betterAuth({
  baseURL: config.services.backendUrl,
  database: initializedAdapter,
  socialProviders: buildSocialProviders(),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: false, // Disable cookie caching to ensure session is validated against DB on every request
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        // Clean up queue jobs for this user (userId stored in metadata JSON)
        await deleteQueueJobsByUserId(user.id);
        logger.info(
          { userId: user.id },
          "Cleaned up queue jobs for deleted user",
        );
      },
    },
    fields: {
      name: "displayName", // Map Better Auth's "name" field to our "displayName" column
    },
    additionalFields: {
      fullName: {
        type: "string",
        required: false,
      },
      userType: {
        type: "string",
        required: true,
        defaultValue: "user",
      },
      isInstanceAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  account: {
    fields: { password: "passwordHash" },
  },
  verification: {
    fields: { value: "token" },
  },
  // Secret is provided by config system (auto-generated in dev, required in production)
  secret: config.security.betterAuthSecret,
  trustedOrigins: localhostVariants([
    config.services.frontendUrl,
    config.services.backendUrl, // Electron desktop client loads the backend-served SPA
    "http://frontend:3000", // Docker container name — not externally routable
  ]),
  databaseHooks: {
    account: {
      create: {
        before: async (account) => {
          // Credential accounts have no OAuth tokens to encrypt
          if (account.providerId === "credential") return;
          return { data: encryptAccountTokens(account) };
        },
      },
      update: {
        before: async (account) => {
          return { data: encryptAccountTokens(account) };
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: (options) => {
        switch (options.model) {
          case "user":
            return generateUserId();

          // Sessions, accounts, and verifications are security-sensitive.
          // Using a cryptographically secure UUID is a good practice.
          case "session":
          case "account":
          case "verification":
            return generateSecurityId();

          // A secure fallback for any other models that might be introduced.
          default:
            return generateSecurityId();
        }
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session.session;
export type User = typeof auth.$Infer.Session.user;
