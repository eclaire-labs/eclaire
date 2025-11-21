/**
 * PostgreSQL/PGlite Transaction Adapter
 *
 * Implements the TransactionManager interface for both PostgreSQL and PGlite.
 * Both databases use the same Drizzle transaction API, so a single implementation works for both.
 * Wraps Drizzle's async transaction API to work with sync-only transaction callbacks.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { SQL } from "drizzle-orm";
import type { Tx, TransactionManager, BaseRepository } from "@/ports/tx";
import * as schema from "@/db/schema/postgres";

// Union type for both PostgreSQL and PGlite databases
type PgDatabase = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

// Extract the transaction type - both extend PgTransaction so this works for both
type DrizzlePgTx = Parameters<
	Parameters<PgDatabase["transaction"]>[0]
>[0];

/**
 * Wraps a Drizzle PostgreSQL/PGlite transaction to provide the Tx interface.
 * Collects operations to execute, then executes them all after the sync callback returns.
 */
function wrapPgTx(drizzleTx: DrizzlePgTx): {
	tx: Tx;
	pendingOps: Array<() => Promise<void>>;
} {
	const pendingOps: Array<() => Promise<void>> = [];

	// Helper to create a repository for a given table
	function createRepository<TTable extends keyof typeof schema>(
		tableName: TTable,
	): BaseRepository<any, any, any> {
		const table = schema[tableName] as any;

		return {
			insert(values: any): void {
				// Queue the operation to be executed after callback returns
				pendingOps.push(async () => {
					await drizzleTx.insert(table).values(values);
				});
			},
			update(where: SQL | undefined, values: any): void {
				if (!where) return;
				pendingOps.push(async () => {
					await drizzleTx.update(table).set(values).where(where);
				});
			},
			delete(where: SQL | undefined): void {
				if (!where) return;
				pendingOps.push(async () => {
					await drizzleTx.delete(table).where(where);
				});
			},
		};
	}

	const tx: Tx = {
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

	return { tx, pendingOps };
}

/**
 * Creates a PostgreSQL/PGlite TransactionManager
 * Works with both PostgreSQL and PGlite as they share the same transaction API.
 */
export function createPgTransactionManager(
	db: PgDatabase,
): TransactionManager {
	return {
		async withTransaction<T>(fn: (tx: Tx) => T): Promise<T> {
			return db.transaction(async (drizzleTx) => {
				const { tx, pendingOps } = wrapPgTx(drizzleTx);

				// Call the user's sync function - this queues operations
				const result = fn(tx);

				// Execute all queued operations sequentially
				for (const op of pendingOps) {
					await op();
				}

				return result;
			});
		},
	};
}
