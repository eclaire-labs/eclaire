import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import {
	pgSchema,
	sqliteSchema,
	createPgTransactionManager,
	createSqliteTransactionManager,
	type TransactionManager,
} from "@eclaire/db";
import { migrate as migratePg } from "drizzle-orm/pglite/migrator";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";

export type TestDbType = "sqlite" | "pglite";

export interface TestDatabase {
	dbType: TestDbType;
	db: any;
	schema: typeof pgSchema | typeof sqliteSchema;
	txManager: TransactionManager;
	cleanup: () => Promise<void>;
}

/**
 * Initialize a test database (in-memory)
 */
export async function initTestDatabase(
	dbType: TestDbType,
): Promise<TestDatabase> {
	if (dbType === "sqlite") {
		// In-memory SQLite database
		const client = new Database(":memory:");

		// Configure SQLite for better performance in tests
		client.pragma("journal_mode = WAL");
		client.pragma("synchronous = NORMAL");
		client.pragma("foreign_keys = ON");

		const db = drizzleSqlite(client, { schema: sqliteSchema });
		const txManager = createSqliteTransactionManager(db, sqliteSchema);

		// Run migrations
		const migrationsPath = path.join(
			process.cwd(),
			"src/db/migrations-sqlite",
		);
		migrateSqlite(db, { migrationsFolder: migrationsPath });

		return {
			dbType: "sqlite",
			db,
			schema: sqliteSchema,
			txManager,
			cleanup: async () => {
				client.close();
			},
		};
	} else {
		// In-memory PGlite database
		const client = new PGlite();

		const db = drizzlePglite(client, { schema: pgSchema });
		const txManager = createPgTransactionManager(db);

		// Run migrations
		const migrationsPath = path.join(
			process.cwd(),
			"src/db/migrations-postgres",
		);
		await migratePg(db, { migrationsFolder: migrationsPath });

		return {
			dbType: "pglite",
			db,
			schema: pgSchema,
			txManager,
			cleanup: async () => {
				await client.close();
			},
		};
	}
}

/**
 * Clean all tables in the database (for test isolation)
 */
export async function cleanDatabase(testDb: TestDatabase): Promise<void> {
	const { db, dbType } = testDb;

	if (dbType === "sqlite") {
		// Disable foreign keys temporarily for cleanup
		db.run(sql`PRAGMA foreign_keys = OFF`);

		// Get all table names
		const tables = db
			.all(
				sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'`,
			)
			.map((t: { name: string }) => t.name);

		// Delete from all tables
		for (const table of tables) {
			db.run(sql.raw(`DELETE FROM ${table}`));
		}

		// Re-enable foreign keys
		db.run(sql`PRAGMA foreign_keys = ON`);
	} else {
		// PGlite: Truncate all tables
		const tables = await db.execute(sql`
			SELECT tablename
			FROM pg_tables
			WHERE schemaname = 'public'
			AND tablename != '__drizzle_migrations'
		`);

		for (const { tablename } of tables.rows) {
			await db.execute(sql.raw(`TRUNCATE TABLE ${tablename} CASCADE`));
		}
	}
}

/**
 * Generate a test user ID
 */
export function generateTestUserId(): string {
	return `user-test-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate a test bookmark ID
 */
export function generateTestBookmarkId(): string {
	return `bm-test-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate a test task ID
 */
export function generateTestTaskId(): string {
	return `task-test-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Generate a test tag ID
 */
export function generateTestTagId(): string {
	return `tag-test-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Create a test user in the database
 */
export async function createTestUser(
	testDb: TestDatabase,
	overrides: Partial<{
		id: string;
		email: string;
		name: string;
	}> = {},
) {
	const userId = overrides.id ?? generateTestUserId();
	const email = overrides.email ?? `test-${userId}@example.com`;
	const name = overrides.name ?? `Test User ${userId}`;

	const { db, dbType } = testDb;

	if (dbType === "sqlite") {
		const users = sqliteSchema.users;
		await db.insert(users).values({
			id: userId,
			email,
			userType: "user",
			displayName: name,
		});
	} else {
		const users = pgSchema.users;
		await db.insert(users).values({
			id: userId,
			email,
			userType: "user",
			displayName: name,
		});
	}

	return { id: userId, email, name };
}

/**
 * Database test configuration for parameterized tests
 */
export const DB_TEST_CONFIGS: Array<{ dbType: TestDbType; label: string }> = [
	{ dbType: "sqlite", label: "SQLite" },
	{ dbType: "pglite", label: "PGlite (PostgreSQL)" },
];
