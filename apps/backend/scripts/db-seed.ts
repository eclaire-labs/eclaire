// Load environment variables before anything else
import '../src/lib/env-loader';

import { hashPassword } from "better-auth/crypto";
import type { InferInsertModel } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { v4 as uuid } from "uuid";
import { randomBytes } from "crypto";
import { getDatabaseUrl } from "../src/db/config";
import * as schema from "../src/db/schema";
import { hmacBase64 } from "../src/lib/api-key-security";

// --- Drizzle Insert Types ---
type InsertUser = InferInsertModel<typeof schema.users>;
type InsertAccount = InferInsertModel<typeof schema.accounts>;
type InsertApiKey = InferInsertModel<typeof schema.apiKeys>;

type Database = PostgresJsDatabase<typeof schema>;

// --- Helper Functions ---
function computeApiKeyHash(fullKey: string): { keyHash: string; hashVersion: number } {
  // Use the HMAC key from environment
  const pepperKey = process.env.API_KEY_HMAC_KEY_V1;
  const allowDevKeys = process.env.ALLOW_DEV_KEYS === "true";

  if (!pepperKey) {
    throw new Error("API_KEY_HMAC_KEY_V1 environment variable is required");
  }

  // Check for dev-only patterns
  if (pepperKey.toLowerCase().startsWith("devonly")) {
    if (!allowDevKeys) {
      throw new Error("API_KEY_HMAC_KEY_V1 contains dev-only pattern. Set ALLOW_DEV_KEYS=true to allow this in development.");
    }
    console.warn("⚠️  Using dev-only HMAC key (ALLOW_DEV_KEYS is true)");
  }

  const keyHash = hmacBase64(fullKey, pepperKey);
  const hashVersion = parseInt(process.env.API_KEY_HMAC_VERSION || "1");
  return { keyHash, hashVersion };
}

// Generate secure API key for production
function generateSecureApiKey(): { fullKey: string; keyId: string; keySuffix: string } {
  const keyId = randomBytes(8).toString('hex').substring(0, 15).toUpperCase();
  const secret = randomBytes(16).toString('hex');
  const fullKey = `sk-${keyId}-${secret}`;
  const keySuffix = secret.substring(secret.length - 4);
  return { fullKey, keyId, keySuffix };
}

// Check if running in production mode based on seed type
const isProductionSeed = process.argv.includes('--essential') && (
  process.env.NODE_ENV === 'production' ||
  process.env.GENERATE_SECURE_KEYS === 'true'
);

// --- Fixed Test API Keys (Development/Testing Only) ---
// These values are pre-calculated and NEVER change
// They are for testing only and should NEVER be used in production
const FIXED_TEST_KEYS = {
  worker: {
    fullKey: "sk-DEVONLYWORKER01-DEVONLY0000000000000000000000000",
    keyId: "DEVONLYWORKER01",
    keySuffix: "0000",
  },
  aiAssistant: {
    fullKey: "sk-DEVONLYAIASST01-DEVONLY1111111111111111111111111",
    keyId: "DEVONLYAIASST01",
    keySuffix: "1111",
  },
  // Demo user API keys
  demoUser1: {
    fullKey: "sk-DEVONLYUSER001-DEVONLY2222222222222222222222222",
    keyId: "DEVONLYUSER001",
    keySuffix: "2222",
  },
  demoUser2: {
    fullKey: "sk-DEVONLYUSER002-DEVONLY3333333333333333333333333",
    keyId: "DEVONLYUSER002",
    keySuffix: "3333",
  },
};

// --- Constants ---
const WORKER_USER_ID = "user-svc-worker";
const WORKER_EMAIL = "service-worker@system.local";
const WORKER_API_KEY_NAME = "Worker API Key";

const AI_ASSISTANT_USER_ID = "user-ai-assistant";
const AI_ASSISTANT_EMAIL = "ai-assistant@system.local";
const AI_ASSISTANT_API_KEY_NAME = "AI Assistant Key";

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

  // Default to essential only (unless --demo is specified)
  if (demo) {
    console.log("🌱 Seeding database with essential users and demo users...");
  } else {
    console.log("🌱 Seeding database with essential users only...");
  }

  const dbUrl = process.env.DATABASE_URL || getDatabaseUrl();
  console.log(`Connecting to database: ${dbUrl}`);

  const client = postgres(dbUrl, {
    max: 10, // Maximum number of connections
    idle_timeout: 20, // Seconds before idle connection is closed
    connect_timeout: 10, // Seconds before connection timeout
  });
  const db: Database = drizzle(client, { schema });

  // Variables to store the generated keys (needed for output at the end)
  let workerKey: { fullKey: string; keyId: string; keySuffix: string };
  let aiAssistantKey: { fullKey: string; keyId: string; keySuffix: string };

  try {
    // Use current timestamp as Date object for PostgreSQL
    const now = new Date();

    // 1. Create Users
    console.log("👤 Creating users...");

    // Essential users (worker and AI assistant)
    const essentialUsersData: InsertUser[] = [
      {
        id: WORKER_USER_ID,
        userType: "worker",
        email: WORKER_EMAIL,
        displayName: "Worker Service",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: AI_ASSISTANT_USER_ID,
        userType: "assistant",
        email: AI_ASSISTANT_EMAIL,
        displayName: "AI Assistant",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Demo users (admin + demo)
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

    let usersData = essentialUsersData;
    if (demo) {
      usersData = [...essentialUsersData, ...demoUsersData];
    }

    await db.insert(schema.users).values(usersData).onConflictDoNothing();
    console.log(`-> ${usersData.length} users ensured.`);

    // 2. Create Accounts
    console.log("🔑 Creating accounts...");

    // Essential accounts (worker and AI assistant)
    const essentialAccountsData: InsertAccount[] = [
      {
        accountId: WORKER_EMAIL,
        providerId: "credential",
        userId: WORKER_USER_ID,
        passwordHash: await hashPassword(uuid()), // Random password for service account
        createdAt: now,
        updatedAt: now,
      },
      {
        accountId: AI_ASSISTANT_EMAIL,
        providerId: "credential",
        userId: AI_ASSISTANT_USER_ID,
        passwordHash: await hashPassword(uuid()), // Random password for service account
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Demo accounts (admin + demo)
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

    let accountsData = essentialAccountsData;
    if (demo) {
      accountsData = [...essentialAccountsData, ...demoAccountsData];
    }

    await db.insert(schema.accounts).values(accountsData).onConflictDoNothing();
    console.log(`-> ${accountsData.length} accounts ensured.`);

    // 3. Create API Keys
    console.log("🔑 Creating API keys...");

    // Essential API keys (worker and AI assistant)
    // Use real secure keys for production, fixed keys for dev/demo
    workerKey = isProductionSeed ? generateSecureApiKey() : FIXED_TEST_KEYS.worker;
    aiAssistantKey = isProductionSeed ? generateSecureApiKey() : FIXED_TEST_KEYS.aiAssistant;

    const workerHash = computeApiKeyHash(workerKey.fullKey);
    const aiAssistantHash = computeApiKeyHash(aiAssistantKey.fullKey);

    const essentialApiKeysData: InsertApiKey[] = [
      {
        keyId: workerKey.keyId,
        keyHash: workerHash.keyHash,
        hashVersion: workerHash.hashVersion,
        keySuffix: workerKey.keySuffix,
        userId: WORKER_USER_ID,
        name: WORKER_API_KEY_NAME,
        createdAt: now,
      },
      {
        keyId: aiAssistantKey.keyId,
        keyHash: aiAssistantHash.keyHash,
        hashVersion: aiAssistantHash.hashVersion,
        keySuffix: aiAssistantKey.keySuffix,
        userId: AI_ASSISTANT_USER_ID,
        name: AI_ASSISTANT_API_KEY_NAME,
        createdAt: now,
      },
    ];

    // Demo API keys - using fixed test keys
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

    let apiKeysToInsert = essentialApiKeysData;
    if (demo) {
      apiKeysToInsert = [...essentialApiKeysData, ...demoApiKeysData];
    }

    await db
      .insert(schema.apiKeys)
      .values(apiKeysToInsert)
      .onConflictDoNothing();
    console.log(`-> ${apiKeysToInsert.length} API keys ensured.`);

    // 4. Log Success & Credentials
    console.log("✅ Seeding completed successfully!");

    if (demo) {
      console.log("--- Test Accounts ---");
      console.log(`  Admin: ${ADMIN_USER_EMAIL} / ${ADMIN_USER_PASSWORD}`);
      console.log(`  Demo:  ${DEMO_USER1_EMAIL} / ${DEMO_USER1_PASSWORD}`);
      console.log(`  Demo API Key: ${FIXED_TEST_KEYS.demoUser1.fullKey}`);
      console.log(`  Demo2: ${DEMO_USER2_EMAIL} / ${DEMO_USER2_PASSWORD}`);
      console.log(`  Demo2 API Key: ${FIXED_TEST_KEYS.demoUser2.fullKey}`);
      console.log("---------------------");
    }

    console.log("--- Service Accounts ---");
    if (isProductionSeed) {
      console.log(`  ⚠️  IMPORTANT: Save these API keys securely - they won't be shown again!`);
    }
    console.log(`  Worker API Key: ${workerKey.fullKey}`);
    console.log(`  AI Assistant API Key: ${aiAssistantKey.fullKey}`);
    console.log("---------------------");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  } finally {
    console.log("Closing database connection.");
    await client.end();
  }
}

// --- Execute Main Function ---
main();
