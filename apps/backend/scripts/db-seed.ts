// Load environment variables before anything else
import "../src/lib/env-loader";

import {
  createPgliteClient,
  createPostgresClient,
  createSqliteClient,
  getDatabaseType,
  getDatabaseUrl,
  getPGlitePath,
  getSqlitePath,
  pgSchema,
  sqliteSchema,
} from "@eclaire/db";
import { hashPassword } from "better-auth/crypto";
import type { InferInsertModel } from "drizzle-orm";
import {
  type BetterSQLite3Database,
  drizzle as drizzleSqlite,
} from "drizzle-orm/better-sqlite3";
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from "drizzle-orm/pglite";
import {
  drizzle as drizzlePostgres,
  type PostgresJsDatabase,
} from "drizzle-orm/postgres-js";
import { config } from "../src/config/index.js";
import { hmacBase64 } from "../src/lib/api-key-security.js";

// Determine which schema to use
const dbType = getDatabaseType();
const schema = dbType === "sqlite" ? sqliteSchema : pgSchema;

// --- Drizzle Insert Types ---
type InsertUser = InferInsertModel<typeof schema.users>;
type InsertAccount = InferInsertModel<typeof schema.accounts>;
type InsertApiKey = InferInsertModel<typeof schema.apiKeys>;

type Database =
  | PostgresJsDatabase<typeof pgSchema>
  | PgliteDatabase<typeof pgSchema>
  | BetterSQLite3Database<typeof sqliteSchema>;

// --- Helper Functions ---
function computeApiKeyHash(fullKey: string): {
  keyHash: string;
  hashVersion: number;
} {
  // Use the HMAC key from config (single source of truth)
  const pepperKey = config.security.apiKeyHmacKeyV1;

  if (!pepperKey) {
    throw new Error(
      "API key HMAC key not available. Config should provide this based on NODE_ENV.",
    );
  }

  const keyHash = hmacBase64(fullKey, pepperKey);
  const hashVersion = parseInt(config.security.apiKeyHmacVersion, 10);
  return { keyHash, hashVersion };
}

// --- Fixed Test API Keys (Development/Testing Only) ---
// These values are pre-calculated and NEVER change
// They are for testing only and should NEVER be used in production
const FIXED_TEST_KEYS = {
  // Demo user API keys (15 char keyId, 32 char secret)
  demoUser1: {
    fullKey: "sk-DEVONLYUSER0001-DEVONLY2222222222222222222222222",
    keyId: "DEVONLYUSER0001",
    keySuffix: "2222",
  },
  demoUser2: {
    fullKey: "sk-DEVONLYUSER0002-DEVONLY3333333333333333333333333",
    keyId: "DEVONLYUSER0002",
    keySuffix: "3333",
  },
};

// --- Constants ---

const DEMO_USER1_ID = "user-demo-1";
const DEMO_USER1_EMAIL = "demo@example.com";
const DEMO_USER1_PASSWORD = "Demo@123";

const DEMO_USER2_ID = "user-demo-2";
const DEMO_USER2_EMAIL = "demo2@example.com";
const DEMO_USER2_PASSWORD = "Demo2@123";

const ADMIN_USER_ID = "user-adm-demo-1";
const ADMIN_USER_EMAIL = "admin@example.com";
const ADMIN_USER_PASSWORD = "Admin@123";

// --- Main Seeding Function ---
async function main() {
  const args = process.argv.slice(2);
  const demo = args.includes("--demo");

  // Determine what to seed:
  // - Default: Nothing (AI assistant created by migration)
  // - --demo: Demo users (admin, demo1, demo2) with accounts and API keys
  if (!demo) {
    console.log("ℹ️  No seeding required.");
    console.log("   AI assistant user is created by migration.");
    console.log("   Use --demo to seed demo users for testing.");
    return;
  }

  console.log("🌱 Seeding database with demo users...");

  let db: Database;
  let cleanup: () => Promise<void>;

  if (dbType === "sqlite") {
    // SQLite setup using client helper
    const sqlitePath = getSqlitePath();
    console.log(`Connecting to SQLite database: ${sqlitePath}`);

    const client = createSqliteClient(sqlitePath);
    db = drizzleSqlite(client, { schema: sqliteSchema }) as Database;
    cleanup = async () => {
      client.close();
    };
  } else if (dbType === "pglite") {
    // PGlite setup using client helper
    const pglitePath = getPGlitePath();
    console.log(`Connecting to PGlite database: ${pglitePath}`);

    const client = createPgliteClient(pglitePath);
    db = drizzlePglite(client, { schema: pgSchema }) as Database;
    cleanup = async () => {
      await client.close();
    };
  } else {
    // PostgreSQL setup using client helper
    const dbUrl = process.env.DATABASE_URL || getDatabaseUrl();
    if (!dbUrl) {
      throw new Error(
        `DATABASE_URL is required for PostgreSQL seeding but was not provided. ` +
          `Either set DATABASE_URL or ensure DATABASE_TYPE=postgres.`,
      );
    }
    console.log(
      `Connecting to PostgreSQL database: ${dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1") ? "local" : "remote"}`,
    );

    const client = createPostgresClient(dbUrl);
    db = drizzlePostgres(client, { schema: pgSchema }) as Database;
    cleanup = async () => {
      await client.end();
    };
  }

  try {
    // Use current timestamp - with mode: 'timestamp_ms', all databases expect Date objects
    const now = new Date();

    // 1. Create Demo Users
    console.log("👤 Creating demo users...");

    const demoUsersData: InsertUser[] = [
      {
        id: ADMIN_USER_ID,
        userType: "user",
        email: ADMIN_USER_EMAIL,
        displayName: "Admin User",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: DEMO_USER1_ID,
        userType: "user",
        email: DEMO_USER1_EMAIL,
        displayName: "Demo User 1",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: DEMO_USER2_ID,
        userType: "user",
        email: DEMO_USER2_EMAIL,
        displayName: "Demo User 2",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    // biome-ignore lint/suspicious/noExplicitAny: union type has incompatible insert signatures
    await (db as any)
      .insert(schema.users)
      .values(demoUsersData)
      .onConflictDoNothing();
    console.log(`-> ${demoUsersData.length} demo users ensured.`);

    // 2. Create Demo Accounts
    console.log("🔑 Creating demo accounts...");

    const demoAccountsData: InsertAccount[] = [
      {
        accountId: ADMIN_USER_EMAIL,
        providerId: "credential",
        userId: ADMIN_USER_ID,
        passwordHash: await hashPassword(ADMIN_USER_PASSWORD),
        createdAt: now,
        updatedAt: now,
      },
      {
        accountId: DEMO_USER1_EMAIL,
        providerId: "credential",
        userId: DEMO_USER1_ID,
        passwordHash: await hashPassword(DEMO_USER1_PASSWORD),
        createdAt: now,
        updatedAt: now,
      },
      {
        accountId: DEMO_USER2_EMAIL,
        providerId: "credential",
        userId: DEMO_USER2_ID,
        passwordHash: await hashPassword(DEMO_USER2_PASSWORD),
        createdAt: now,
        updatedAt: now,
      },
    ];

    // biome-ignore lint/suspicious/noExplicitAny: union type has incompatible insert signatures
    await (db as any)
      .insert(schema.accounts)
      .values(demoAccountsData)
      .onConflictDoNothing();
    console.log(`-> ${demoAccountsData.length} demo accounts ensured.`);

    // 3. Create Demo API Keys
    console.log("🔑 Creating demo API keys...");

    const demoUser1Hash = computeApiKeyHash(FIXED_TEST_KEYS.demoUser1.fullKey);
    const demoUser2Hash = computeApiKeyHash(FIXED_TEST_KEYS.demoUser2.fullKey);

    const demoApiKeysData: InsertApiKey[] = [
      {
        keyId: FIXED_TEST_KEYS.demoUser1.keyId,
        keyHash: demoUser1Hash.keyHash,
        hashVersion: demoUser1Hash.hashVersion,
        keySuffix: FIXED_TEST_KEYS.demoUser1.keySuffix,
        userId: DEMO_USER1_ID,
        name: "Demo User Test API Key",
        createdAt: now,
      },
      {
        keyId: FIXED_TEST_KEYS.demoUser2.keyId,
        keyHash: demoUser2Hash.keyHash,
        hashVersion: demoUser2Hash.hashVersion,
        keySuffix: FIXED_TEST_KEYS.demoUser2.keySuffix,
        userId: DEMO_USER2_ID,
        name: "Demo User 2 Test API Key",
        createdAt: now,
      },
    ];

    // biome-ignore lint/suspicious/noExplicitAny: union type has incompatible insert signatures
    await (db as any)
      .insert(schema.apiKeys)
      .values(demoApiKeysData)
      .onConflictDoNothing();
    console.log(`-> ${demoApiKeysData.length} demo API keys ensured.`);

    // 4. Log Success & Credentials
    console.log("✅ Seeding completed successfully!");
    console.log("--- Demo Accounts ---");
    console.log(`  Admin: ${ADMIN_USER_EMAIL} / ${ADMIN_USER_PASSWORD}`);
    console.log(`  Demo:  ${DEMO_USER1_EMAIL} / ${DEMO_USER1_PASSWORD}`);
    console.log(`  Demo API Key: ${FIXED_TEST_KEYS.demoUser1.fullKey}`);
    console.log(`  Demo2: ${DEMO_USER2_EMAIL} / ${DEMO_USER2_PASSWORD}`);
    console.log(`  Demo2 API Key: ${FIXED_TEST_KEYS.demoUser2.fullKey}`);
    console.log("---------------------");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    console.log("Closing database connection.");
    await cleanup();
  }
}

// --- Execute Main Function ---
main();
