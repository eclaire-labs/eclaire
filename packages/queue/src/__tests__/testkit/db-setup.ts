/**
 * Database setup for queue contract tests
 *
 * Creates in-memory SQLite or PGlite databases with queue tables.
 * Uses drizzle-kit's programmatic API to generate schema from Drizzle definitions,
 * ensuring tests always use the same schema as production.
 */

import { createRequire } from "node:module";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";

import type { TestDbType } from "./config.js";
import type { DbCapabilities } from "../../driver-db/types.js";
import {
  queueJobsPg,
  queueJobsSqlite,
  queueSchedulesPg,
  queueSchedulesSqlite,
} from "../../driver-db/schema.js";
import * as sqliteSchema from "../../driver-db/schema/sqlite.js";
import * as postgresSchema from "../../driver-db/schema/postgres.js";

// ESM workaround for drizzle-kit/api (see https://github.com/drizzle-team/drizzle-orm/discussions/4373)
const require = createRequire(import.meta.url);
type DrizzleKitApi = typeof import("drizzle-kit/api");
const drizzleKit = require("drizzle-kit/api") as DrizzleKitApi;

/**
 * Test database interface returned by createQueueTestDatabase
 */
export interface QueueTestDatabase {
  /** Database type */
  dbType: TestDbType;

  /** Drizzle database instance */
  db: any;

  /** Queue schema tables */
  schema: {
    queueJobs: typeof queueJobsPg | typeof queueJobsSqlite;
    queueSchedules: typeof queueSchedulesPg | typeof queueSchedulesSqlite;
  };

  /** Database capabilities */
  capabilities: DbCapabilities;

  /** Cleanup function - call in afterEach */
  cleanup: () => Promise<void>;
}

/**
 * Create an in-memory test database with queue tables
 *
 * @param dbType - Database type ("sqlite" or "pglite")
 * @returns Test database with cleanup function
 *
 * @example
 * ```typescript
 * let testDb: QueueTestDatabase;
 *
 * beforeEach(async () => {
 *   testDb = await createQueueTestDatabase("sqlite");
 * });
 *
 * afterEach(async () => {
 *   await testDb.cleanup();
 * });
 * ```
 */
export async function createQueueTestDatabase(
  dbType: TestDbType,
): Promise<QueueTestDatabase> {
  if (dbType === "sqlite") {
    return createSqliteTestDatabase();
  } else {
    return createPgliteTestDatabase();
  }
}

async function createSqliteTestDatabase(): Promise<QueueTestDatabase> {
  // Create in-memory SQLite database
  const client = new Database(":memory:");

  // Configure SQLite for better performance in tests
  client.pragma("journal_mode = WAL");
  client.pragma("synchronous = NORMAL");
  client.pragma("foreign_keys = ON");

  // Generate schema from Drizzle definitions using drizzle-kit
  // This ensures tests always match the production schema
  const emptySchema = await drizzleKit.generateSQLiteDrizzleJson({});
  const currentSchema = await drizzleKit.generateSQLiteDrizzleJson(sqliteSchema);
  const statements = await drizzleKit.generateSQLiteMigration(
    emptySchema,
    currentSchema,
  );

  // Execute each statement
  for (const stmt of statements) {
    client.exec(stmt);
  }

  const db = drizzleSqlite(client);

  return {
    dbType: "sqlite",
    db,
    schema: {
      queueJobs: queueJobsSqlite,
      queueSchedules: queueSchedulesSqlite,
    },
    capabilities: {
      skipLocked: false,
      notify: false,
      jsonb: false,
      type: "sqlite",
    },
    cleanup: async () => {
      client.close();
    },
  };
}

async function createPgliteTestDatabase(): Promise<QueueTestDatabase> {
  // Create in-memory PGlite database (no dataDir = in-memory)
  const client = new PGlite();

  const db = drizzlePglite(client);

  // Push schema from Drizzle definitions using drizzle-kit
  // This ensures tests always match the production schema
  const result = await drizzleKit.pushSchema(postgresSchema, db);
  await result.apply();

  return {
    dbType: "pglite",
    db,
    schema: {
      queueJobs: queueJobsPg,
      queueSchedules: queueSchedulesPg,
    },
    capabilities: {
      skipLocked: true,
      notify: false, // PGlite doesn't support NOTIFY/LISTEN
      jsonb: true,
      type: "postgres",
    },
    cleanup: async () => {
      await client.close();
    },
  };
}
