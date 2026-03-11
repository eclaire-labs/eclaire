// lib/auth.ts

import { generateSecurityId, generateUserId } from "@eclaire/core";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { config } from "../config/index.js";
import { db, dbType, schema } from "../db/index.js"; // Your drizzle database instance and conditional schema
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

export const auth = betterAuth({
  baseURL: config.services.backendUrl,
  database: initializedAdapter,
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
  trustedOrigins: [
    config.services.frontendUrl,
    "http://frontend:3000", // Docker container name — not externally routable
    ...(config.isProduction
      ? []
      : ["http://localhost:3000", "http://127.0.0.1:3000"]),
  ],
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
