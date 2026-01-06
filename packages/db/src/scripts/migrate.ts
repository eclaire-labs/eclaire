/**
 * Database migration script for @eclaire/db.
 *
 * Supports PostgreSQL, PGlite, and SQLite databases.
 * Usage:
 *   pnpm --filter @eclaire/db db:migrate
 *   pnpm --filter @eclaire/db db:migrate --status
 *   pnpm --filter @eclaire/db db:migrate --force
 */

// Load environment FIRST - uses shared loader from @eclaire/core
// Importing @eclaire/core triggers env loading as a side effect
import "@eclaire/core";

import { resolve } from "node:path";
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

// Migration folders relative to this script (from dist/scripts/ back to src/migrations/)
const SQLITE_MIGRATIONS = resolve(import.meta.dirname, "../../src/migrations/sqlite");
const POSTGRES_MIGRATIONS = resolve(import.meta.dirname, "../../src/migrations/postgres");

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
			console.log("Database migrations completed successfully!");
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
			console.log("Database migrations completed successfully!");
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
	if (!dbUrl) {
		throw new Error(
			`DATABASE_URL is required for PostgreSQL migrations but was not provided. ` +
			`Either set DATABASE_URL or ensure DATABASE_TYPE=postgres.`
		);
	}
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
			console.log("Database migrations completed successfully!");
		}
	} catch (error) {
		console.error("Migration failed:", error);
		process.exit(1);
	} finally {
		console.log("Closing database connection");
		await client.end({ timeout: 5 });
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
