/**
 * Database setup for queue contract tests
 *
 * Creates in-memory SQLite or PGlite databases with queue tables.
 */

import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";

import type { TestDbType } from "./config.js";
import type { DbCapabilities } from "../../driver-db/types.js";
import {
  queueJobsPg,
  queueJobsSqlite,
  queueSchedulesPg,
  queueSchedulesSqlite,
} from "../../driver-db/schema.js";

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
 * SQL statements to create queue_jobs table for SQLite
 */
const SQLITE_CREATE_QUEUE_JOBS = `
CREATE TABLE IF NOT EXISTS queue_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_for INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at INTEGER,
  backoff_ms INTEGER,
  backoff_type TEXT,
  locked_by TEXT,
  locked_at INTEGER,
  expires_at INTEGER,
  lock_token TEXT,
  error_message TEXT,
  error_details TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS queue_jobs_name_key_idx ON queue_jobs (name, key);
CREATE INDEX IF NOT EXISTS queue_jobs_name_status_idx ON queue_jobs (name, status);
CREATE INDEX IF NOT EXISTS queue_jobs_status_scheduled_idx ON queue_jobs (status, scheduled_for);
CREATE INDEX IF NOT EXISTS queue_jobs_status_retry_idx ON queue_jobs (status, next_retry_at);
CREATE INDEX IF NOT EXISTS queue_jobs_status_expires_idx ON queue_jobs (status, expires_at);
`;

/**
 * SQL statements to create queue_schedules table for SQLite
 */
const SQLITE_CREATE_QUEUE_SCHEDULES = `
CREATE TABLE IF NOT EXISTS queue_schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  cron TEXT NOT NULL,
  data TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  run_limit INTEGER,
  run_count INTEGER NOT NULL DEFAULT 0,
  end_date INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS queue_schedules_enabled_next_run_idx ON queue_schedules (enabled, next_run_at);
`;

/**
 * SQL statements to create queue_jobs table for PostgreSQL
 * Each statement must be executed separately
 */
const PGLITE_CREATE_QUEUE_JOBS_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS queue_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT,
    data JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 0,
    scheduled_for TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMP,
    backoff_ms INTEGER,
    backoff_type TEXT,
    locked_by TEXT,
    locked_at TIMESTAMP,
    expires_at TIMESTAMP,
    lock_token TEXT,
    error_message TEXT,
    error_details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS queue_jobs_name_key_idx ON queue_jobs (name, key)`,
  `CREATE INDEX IF NOT EXISTS queue_jobs_name_status_idx ON queue_jobs (name, status)`,
  `CREATE INDEX IF NOT EXISTS queue_jobs_status_scheduled_idx ON queue_jobs (status, scheduled_for)`,
  `CREATE INDEX IF NOT EXISTS queue_jobs_status_retry_idx ON queue_jobs (status, next_retry_at)`,
  `CREATE INDEX IF NOT EXISTS queue_jobs_status_expires_idx ON queue_jobs (status, expires_at)`,
];

/**
 * SQL statements to create queue_schedules table for PostgreSQL
 */
const PGLITE_CREATE_QUEUE_SCHEDULES_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS queue_schedules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key TEXT NOT NULL UNIQUE,
    cron TEXT NOT NULL,
    data JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    run_limit INTEGER,
    run_count INTEGER NOT NULL DEFAULT 0,
    end_date TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS queue_schedules_enabled_next_run_idx ON queue_schedules (enabled, next_run_at)`,
];

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

  // Create tables
  client.exec(SQLITE_CREATE_QUEUE_JOBS);
  client.exec(SQLITE_CREATE_QUEUE_SCHEDULES);

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

  // Create tables - execute each statement separately
  for (const stmt of PGLITE_CREATE_QUEUE_JOBS_STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }
  for (const stmt of PGLITE_CREATE_QUEUE_SCHEDULES_STATEMENTS) {
    await db.execute(sql.raw(stmt));
  }

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
