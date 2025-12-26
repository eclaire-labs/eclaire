// lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, dbType, schema } from "../db/index.js"; // Your drizzle database instance and conditional schema
import { generateSecurityId, generateUserId } from "@eclaire/core";
import { createChildLogger } from "./logger.js";
import { config } from "../config/index.js";
import { deleteQueueJobsByUserId } from "./services/user-data.js";

const logger = createChildLogger("auth");

logger.info({}, "Initializing Better Auth configuration");
logger.debug(
  {
    dbLoaded: !!db,
    schemaLoaded: !!schema,
  },
  "DB and schema loading status",
);

let initializedAdapter;
try {
  if (
    !db ||
    !schema ||
    !schema.users ||
    !schema.sessions ||
    !schema.accounts ||
    !schema.verifications
  ) {
    logger.error(
      {
        dbLoaded: !!db,
        schemaLoaded: !!schema,
        usersLoaded: !!schema?.users,
        sessionsLoaded: !!schema?.sessions,
        accountsLoaded: !!schema?.accounts,
        verificationsLoaded: !!schema?.verifications,
      },
      "Critical: DB or schema parts are undefined. Adapter initialization will likely fail",
    );
    throw new Error("DB or schema not properly loaded for Drizzle adapter.");
  }
  // Determine the correct provider based on database type
  const provider = dbType === "sqlite" ? "sqlite" : "pg";

  logger.info({ dbType, provider }, "Configuring Drizzle adapter with provider");

  initializedAdapter = drizzleAdapter(db, {
    provider: provider, // Dynamically set based on DATABASE_TYPE
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  });
  logger.info({}, "Drizzle adapter initialized successfully");
} catch (error) {
  logger.error(
    {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    },
    "ERROR initializing Drizzle adapter",
  );
  // Consider how to handle this error; perhaps throw it to stop the app
  // or set initializedAdapter to a state that 'betterAuth' can handle or will clearly show an error.
}

export const auth = betterAuth({
  database: initializedAdapter, // Use the potentially try-catched adapter
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
        logger.info({ userId: user.id }, "Cleaned up queue jobs for deleted user");
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
  //basePath: "/api/auth", // Keep this commented out as per previous advice
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://frontend:3000", // Docker container name
    config.services.frontendUrl,
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
