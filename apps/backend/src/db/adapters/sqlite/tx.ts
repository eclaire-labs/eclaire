/**
 * SQLite Transaction Adapter
 *
 * Implements the TransactionManager interface for SQLite using better-sqlite3.
 * Uses a mutex to serialize transactions while allowing async callbacks.
 *
 * This enables Read-Modify-Write patterns inside transactions while respecting
 * better-sqlite3's synchronous nature.
 */

import { Mutex } from "async-mutex";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Tx, TransactionManager, BaseRepository } from "@/ports/tx";
import { generateTagId } from "@/lib/id-generator";

// For now, we'll use a minimal schema type. This will need to be updated
// when we create the SQLite-specific schema
type SQLiteSchema = Record<string, any>;

// Module-level mutex for SQLite transaction serialization
// This ensures only one transaction runs at a time, matching SQLite's single-writer semantics
const sqliteMutex = new Mutex();

/**
 * Wraps a Drizzle SQLite database to provide the Tx interface.
 * All operations execute synchronously but are wrapped in async for API consistency.
 */
function wrapSqliteTx(
	db: BetterSQLite3Database<SQLiteSchema>,
	schema: SQLiteSchema,
): Tx {
	// Helper to create a repository for a given table
	function createRepository<TTableName extends string>(
		tableName: TTableName,
	): BaseRepository<any, any, any> {
		const table = schema[tableName];

		if (!table) {
			console.warn(`Table ${tableName} not found in schema`);
		}

		return {
			async insert(values: any): Promise<void> {
				if (!table) return;
				// Execute synchronously but return Promise for API consistency
				db.insert(table).values(values).run();
			},
			async update(where: SQL | undefined, values: any): Promise<void> {
				if (!table || !where) return;
				db.update(table).set(values).where(where).run();
			},
			async delete(where: SQL | undefined): Promise<void> {
				if (!table || !where) return;
				db.delete(table).where(where).run();
			},
			async findFirst(where: SQL | undefined): Promise<any | undefined> {
				if (!table) return undefined;
				const baseQuery = db.select().from(table);
				// Use .get() for single row (better-sqlite3 optimization)
				return where
					? baseQuery.where(where).limit(1).get()
					: baseQuery.limit(1).get();
			},
			async findMany(where: SQL | undefined): Promise<any[]> {
				if (!table) return [];
				const baseQuery = db.select().from(table);
				return where ? baseQuery.where(where).all() : baseQuery.all();
			},
		};
	}

	return {
		users: createRepository("users"),
		bookmarks: createRepository("bookmarks"),
		bookmarksTags: createRepository("bookmarksTags"),
		tasks: createRepository("tasks"),
		tasksTags: createRepository("tasksTags"),
		documents: createRepository("documents"),
		documentsTags: createRepository("documentsTags"),
		photos: createRepository("photos"),
		photosTags: createRepository("photosTags"),
		notes: createRepository("notes"),
		notesTags: createRepository("notesTags"),
		assetProcessingJobs: createRepository("assetProcessingJobs"),
		tags: createRepository("tags"),
		history: createRepository("history"),
		conversations: createRepository("conversations"),
		messages: createRepository("messages"),
		channels: createRepository("channels"),
		feedback: createRepository("feedback"),

		async getOrCreateTags(
			tagNames: string[],
			userId: string,
		): Promise<{ id: string; name: string }[]> {
			const tagsTable = schema.tags;
			if (!tagsTable) return [];
			if (!tagNames || tagNames.length === 0) return [];

			const uniqueNames = [
				...new Set(
					tagNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
				),
			];
			if (uniqueNames.length === 0) return [];

			// Atomic upsert: insert all tags, ignore conflicts on (userId, name)
			// SQLite uses synchronous .run() method
			db.insert(tagsTable)
				.values(
					uniqueNames.map((name) => ({
						id: generateTagId(),
						name,
						userId,
					})),
				)
				.onConflictDoNothing({ target: [tagsTable.userId, tagsTable.name] })
				.run();

			// Fetch all matching tags using synchronous .all() method
			return db
				.select({ id: tagsTable.id, name: tagsTable.name })
				.from(tagsTable)
				.where(
					and(eq(tagsTable.userId, userId), inArray(tagsTable.name, uniqueNames)),
				)
				.all();
		},
	};
}

/**
 * Creates a SQLite TransactionManager
 *
 * Uses a mutex to serialize transactions, allowing async callbacks while
 * respecting better-sqlite3's synchronous nature. This matches SQLite's
 * single-writer WAL mode semantics.
 */
export function createSqliteTransactionManager(
	db: BetterSQLite3Database<SQLiteSchema>,
	schema: SQLiteSchema,
): TransactionManager {
	return {
		async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
			// Acquire mutex - serializes all transactions
			const release = await sqliteMutex.acquire();

			try {
				const tx = wrapSqliteTx(db, schema);

				// Begin transaction with IMMEDIATE to acquire write lock early
				// This prevents deadlocks by signaling write intent upfront
				db.run(sql`BEGIN IMMEDIATE`);

				try {
					// Execute async callback
					const result = await fn(tx);

					// Commit on success
					db.run(sql`COMMIT`);
					return result;
				} catch (error) {
					// Rollback on error
					try {
						db.run(sql`ROLLBACK`);
					} catch (rollbackError) {
						// Log rollback failure but throw original error
						console.error(
							"Failed to rollback SQLite transaction:",
							rollbackError,
						);
					}
					throw error;
				}
			} finally {
				release();
			}
		},
	};
}
