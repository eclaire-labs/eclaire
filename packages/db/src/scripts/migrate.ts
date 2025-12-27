/**
 * Database migration script for @eclaire/db.
 *
 * Supports PostgreSQL, PGlite, and SQLite databases.
 * Usage:
 *   pnpm --filter @eclaire/db db:migrate
 *   pnpm --filter @eclaire/db db:migrate --status
 *   pnpm --filter @eclaire/db db:migrate --force
 */

import { resolve } from "node:path";
import { config } from "dotenv";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import {
	getDatabaseUrl,
	getDatabaseType,
	getPGlitePath,
	getSqlitePath,
} from "../config.js";
import {
	createSqliteClient,
	createPgliteClient,
	createPostgresClient,
} from "../clients.js";
import * as pgSchema from "../schema/postgres.js";
import * as sqliteSchema from "../schema/sqlite.js";

// Resolve backend directory to load environment files
const backendDir = resolve(import.meta.dirname, "../../../../apps/backend");

// Load env file based on NODE_ENV (matching seed script pattern)
// dotenv.config() does NOT override existing env vars
const envFile = process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev";
config({ path: resolve(backendDir, envFile) });

// Migration folders relative to this script (from dist/scripts/ back to src/migrations/)
const SQLITE_MIGRATIONS = resolve(import.meta.dirname, "../../src/migrations/sqlite");
const POSTGRES_MIGRATIONS = resolve(import.meta.dirname, "../../src/migrations/postgres");

// ============================================================================
// Queue tables SQL (from @eclaire/queue - these don't have pre-generated migrations)
// Uses CREATE TABLE IF NOT EXISTS for idempotency
// ============================================================================

const QUEUE_TABLES_SQLITE = `
-- Queue jobs table
CREATE TABLE IF NOT EXISTS "queue_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"key" text,
	"data" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"scheduled_for" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" integer,
	"backoff_ms" integer,
	"backoff_type" text,
	"locked_by" text,
	"locked_at" integer,
	"expires_at" integer,
	"lock_token" text,
	"error_message" text,
	"error_details" text,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL,
	"completed_at" integer,
	"stages" text,
	"current_stage" text,
	"overall_progress" integer DEFAULT 0,
	"metadata" text
);

-- Queue schedules table
CREATE TABLE IF NOT EXISTS "queue_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"key" text NOT NULL UNIQUE,
	"cron" text NOT NULL,
	"data" text NOT NULL,
	"enabled" integer DEFAULT true NOT NULL,
	"last_run_at" integer,
	"next_run_at" integer,
	"run_limit" integer,
	"run_count" integer DEFAULT 0 NOT NULL,
	"end_date" integer,
	"created_at" integer NOT NULL,
	"updated_at" integer NOT NULL
);

-- Indexes (CREATE INDEX IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "queue_jobs_queue_key_idx" ON "queue_jobs" ("queue","key");
CREATE INDEX IF NOT EXISTS "queue_jobs_queue_status_idx" ON "queue_jobs" ("queue","status");
CREATE INDEX IF NOT EXISTS "queue_jobs_status_scheduled_idx" ON "queue_jobs" ("status","scheduled_for");
CREATE INDEX IF NOT EXISTS "queue_jobs_status_retry_idx" ON "queue_jobs" ("status","next_retry_at");
CREATE INDEX IF NOT EXISTS "queue_jobs_status_expires_idx" ON "queue_jobs" ("status","expires_at");
CREATE INDEX IF NOT EXISTS "queue_schedules_enabled_next_run_idx" ON "queue_schedules" ("enabled","next_run_at");
`;

const QUEUE_TABLES_POSTGRES = `
-- Queue jobs table
CREATE TABLE IF NOT EXISTS "queue_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"key" text,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp,
	"backoff_ms" integer,
	"backoff_type" text,
	"locked_by" text,
	"locked_at" timestamp,
	"expires_at" timestamp,
	"lock_token" text,
	"error_message" text,
	"error_details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"stages" jsonb,
	"current_stage" text,
	"overall_progress" integer DEFAULT 0,
	"metadata" jsonb
);

-- Queue schedules table
CREATE TABLE IF NOT EXISTS "queue_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"key" text NOT NULL UNIQUE,
	"cron" text NOT NULL,
	"data" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"run_limit" integer,
	"run_count" integer DEFAULT 0 NOT NULL,
	"end_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes (CREATE INDEX IF NOT EXISTS)
CREATE UNIQUE INDEX IF NOT EXISTS "queue_jobs_queue_key_idx" ON "queue_jobs" ("queue","key");
CREATE INDEX IF NOT EXISTS "queue_jobs_queue_status_idx" ON "queue_jobs" ("queue","status");
CREATE INDEX IF NOT EXISTS "queue_jobs_status_scheduled_idx" ON "queue_jobs" ("status","scheduled_for");
CREATE INDEX IF NOT EXISTS "queue_jobs_status_retry_idx" ON "queue_jobs" ("status","next_retry_at");
CREATE INDEX IF NOT EXISTS "queue_jobs_status_expires_idx" ON "queue_jobs" ("status","expires_at");
CREATE INDEX IF NOT EXISTS "queue_schedules_enabled_next_run_idx" ON "queue_schedules" ("enabled","next_run_at");
`;

async function main() {
	const args = process.argv.slice(2);
	const forceFlag = args.includes("--force");
	const statusFlag = args.includes("--status");

	const dbType = getDatabaseType();

	if (dbType === "sqlite") {
		await runSqliteMigrations(statusFlag, forceFlag);
	} else if (dbType === "pglite") {
		await runPgliteMigrations(statusFlag, forceFlag);
	} else {
		await runPostgresMigrations(statusFlag, forceFlag);
	}
}

async function runSqliteMigrations(statusFlag: boolean, forceFlag: boolean) {
	const sqlitePath = getSqlitePath();
	console.log(`Connecting to SQLite database: ${sqlitePath}`);

	const client = createSqliteClient(sqlitePath);
	const db = drizzleSqlite(client, { schema: sqliteSchema });

	try {
		if (statusFlag) {
			console.log("Checking migration status...");
			try {
				const result = client.prepare("SELECT count(*) as count FROM users").get() as { count: number };
				console.log("Database appears to be migrated (users table exists)");
				console.log(`   Users count: ${result.count}`);
			} catch (error) {
				console.log("Database appears to need migration (users table missing)");
				if (error instanceof Error) {
					console.log(`   Error: ${error.message}`);
				}
			}
		} else {
			checkProductionSafety(forceFlag);

			console.log("Running database migrations on SQLite...");
			console.log(`   Migrations folder: ${SQLITE_MIGRATIONS}`);

			await migrateSqlite(db, { migrationsFolder: SQLITE_MIGRATIONS });
			console.log("Core database migrations completed!");

			// Create queue tables (idempotent - uses IF NOT EXISTS)
			console.log("Creating queue tables...");
			client.exec(QUEUE_TABLES_SQLITE);
			console.log("Queue tables created successfully!");
			console.log("All database migrations completed successfully!");
		}
	} catch (error) {
		console.error("Migration failed:", error);
		process.exit(1);
	} finally {
		console.log("Closing database connection");
		client.close();
	}
}

async function runPgliteMigrations(statusFlag: boolean, forceFlag: boolean) {
	const pglitePath = getPGlitePath();
	console.log(`Connecting to PGlite database: ${pglitePath}`);

	const client = createPgliteClient(pglitePath);
	const db = drizzlePglite(client, { schema: pgSchema });

	try {
		if (statusFlag) {
			console.log("Checking migration status...");
			try {
				await db.select().from(pgSchema.users).limit(0);
				console.log("Database appears to be migrated (users table exists)");
			} catch (error) {
				console.log("Database appears to need migration (users table missing)");
				if (error instanceof Error) {
					console.log(`   Error: ${error.message}`);
				}
			}
		} else {
			checkProductionSafety(forceFlag);

			console.log("Running database migrations on PGlite...");
			console.log(`   Migrations folder: ${POSTGRES_MIGRATIONS}`);

			await migratePglite(db, { migrationsFolder: POSTGRES_MIGRATIONS });
			console.log("Core database migrations completed!");

			// Create queue tables (idempotent - uses IF NOT EXISTS)
			console.log("Creating queue tables...");
			await client.exec(QUEUE_TABLES_POSTGRES);
			console.log("Queue tables created successfully!");
			console.log("All database migrations completed successfully!");
		}
	} catch (error) {
		console.error("Migration failed:", error);
		process.exit(1);
	} finally {
		console.log("Closing database connection");
		await client.close();
	}
}

async function runPostgresMigrations(statusFlag: boolean, forceFlag: boolean) {
	const dbUrl = process.env.DATABASE_URL || getDatabaseUrl();
	console.log(`Connecting to PostgreSQL database: ${dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1") ? "local" : "remote"}`);

	const client = createPostgresClient(dbUrl, {
		onnotice: () => {}, // Suppress NOTICE messages
	});

	const db = drizzlePostgres(client, { schema: pgSchema });

	try {
		if (statusFlag) {
			console.log("Checking migration status...");
			try {
				const result = await client`SELECT count(*) FROM users`;
				console.log("Database appears to be migrated (users table exists)");
				console.log(`   Users count: ${result[0]?.count ?? "unknown"}`);
			} catch (error) {
				console.log("Database appears to need migration (users table missing)");
				if (error instanceof Error) {
					console.log(`   Error: ${error.message}`);
				} else {
					console.log(`   An unknown error occurred: ${error}`);
				}
			}
		} else {
			checkProductionSafety(forceFlag);

			console.log("Running database migrations on PostgreSQL...");
			console.log(`   Migrations folder: ${POSTGRES_MIGRATIONS}`);

			await migratePostgres(db, { migrationsFolder: POSTGRES_MIGRATIONS });
			console.log("Core database migrations completed!");

			// Create queue tables (idempotent - uses IF NOT EXISTS)
			console.log("Creating queue tables...");
			await client.unsafe(QUEUE_TABLES_POSTGRES);
			console.log("Queue tables created successfully!");
			console.log("All database migrations completed successfully!");
		}
	} catch (error) {
		console.error("Migration failed:", error);
		process.exit(1);
	} finally {
		console.log("Closing database connection");
		await client.end();
	}
}

function checkProductionSafety(forceFlag: boolean) {
	if (!forceFlag && process.env.NODE_ENV === "production") {
		console.log("Running migrations in PRODUCTION environment.");
		console.log("   This will apply all pending migrations to the database.");
		console.log("   Make sure you have a backup before proceeding.");
		console.log("");
		console.log("Production mode requires --force flag for safety");
		process.exit(1);
	} else if (process.env.NODE_ENV !== "production") {
		console.log("Running migrations in development mode...");
	}
}

main();
