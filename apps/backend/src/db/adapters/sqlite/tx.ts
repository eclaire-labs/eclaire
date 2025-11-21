/**
 * SQLite Transaction Adapter
 *
 * Implements the TransactionManager interface for SQLite using better-sqlite3.
 * Uses synchronous transaction callbacks as required by better-sqlite3.
 */

import type Database from "better-sqlite3";
import type { SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Tx, TransactionManager, BaseRepository } from "@/ports/tx";
import { isPromise } from "@/db/utils";

// For now, we'll use a minimal schema type. This will need to be updated
// when we create the SQLite-specific schema
type SQLiteSchema = Record<string, any>;

type DrizzleSqliteTx = Parameters<
	Parameters<BetterSQLite3Database<SQLiteSchema>["transaction"]>[0]
>[0];

/**
 * Wraps a Drizzle SQLite transaction to provide the Tx interface.
 * All operations execute immediately and synchronously.
 */
function wrapSqliteTx(
	drizzleTx: DrizzleSqliteTx,
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
			insert(values: any): void {
				if (!table) return;
				// Execute immediately and synchronously
				drizzleTx.insert(table).values(values).run();
			},
			update(where: SQL | undefined, values: any): void {
				if (!table || !where) return;
				drizzleTx.update(table).set(values).where(where).run();
			},
			delete(where: SQL | undefined): void {
				if (!table || !where) return;
				drizzleTx.delete(table).where(where).run();
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
	};
}

/**
 * Creates a SQLite TransactionManager
 */
export function createSqliteTransactionManager(
	db: BetterSQLite3Database<SQLiteSchema>,
	schema: SQLiteSchema,
): TransactionManager {
	return {
		async withTransaction<T>(fn: (tx: Tx) => T): Promise<T> {
			let result!: T;

			// better-sqlite3 requires a sync callback
			// db.transaction() executes immediately and returns void
			db.transaction((drizzleTx: any) => {
				const tx = wrapSqliteTx(drizzleTx, schema);

				// Call the user's sync function
				const maybePromise = fn(tx);

				// Safety check: ensure the callback didn't return a promise
				if (isPromise(maybePromise)) {
					throw new Error(
						"Transaction callback must be synchronous (no `await` allowed). " +
							"Pre-generate IDs and do side-effects after the transaction.",
					);
				}

				result = maybePromise as T;
			});

			return result;
		},
	};
}
