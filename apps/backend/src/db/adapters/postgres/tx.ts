/**
 * PostgreSQL/PGlite Transaction Adapter
 *
 * Implements the TransactionManager interface for both PostgreSQL and PGlite.
 * Both databases use the same Drizzle transaction API, so a single implementation works for both.
 *
 * Uses native async transactions directly - no operation queuing needed.
 * Supports full Read-Modify-Write patterns inside transactions.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { Tx, TransactionManager, BaseRepository } from "@/ports/tx";
import * as schema from "@/db/schema/postgres";
import { generateTagId } from "@/lib/id-generator";

// Union type for both PostgreSQL and PGlite databases
type PgDatabase = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

// Extract the transaction type - both extend PgTransaction so this works for both
type DrizzlePgTx = Parameters<
	Parameters<PgDatabase["transaction"]>[0]
>[0];

/**
 * Wraps a Drizzle PostgreSQL/PGlite transaction to provide the Tx interface.
 * All operations execute directly and async - no queuing.
 */
function wrapPgTx(drizzleTx: DrizzlePgTx): Tx {
	// Helper to create a repository for a given table
	function createRepository<TTable extends keyof typeof schema>(
		tableName: TTable,
	): BaseRepository<any, any, any> {
		const table = schema[tableName] as any;

		return {
			async insert(values: any): Promise<void> {
				await drizzleTx.insert(table).values(values);
			},
			async update(where: SQL | undefined, values: any): Promise<void> {
				if (!where) return;
				await drizzleTx.update(table).set(values).where(where);
			},
			async delete(where: SQL | undefined): Promise<void> {
				if (!where) return;
				await drizzleTx.delete(table).where(where);
			},
			async findFirst(where: SQL | undefined): Promise<any | undefined> {
				const baseQuery = drizzleTx.select().from(table);
				const results = where
					? await baseQuery.where(where).limit(1)
					: await baseQuery.limit(1);
				return results[0];
			},
			async findMany(where: SQL | undefined): Promise<any[]> {
				const baseQuery = drizzleTx.select().from(table);
				return where ? await baseQuery.where(where) : await baseQuery;
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
			if (!tagNames || tagNames.length === 0) return [];

			const uniqueNames = [
				...new Set(
					tagNames.map((name) => name.trim().toLowerCase()).filter(Boolean),
				),
			];
			if (uniqueNames.length === 0) return [];

			// Atomic upsert: insert all tags, ignore conflicts on (userId, name)
			await drizzleTx
				.insert(schema.tags)
				.values(
					uniqueNames.map((name) => ({
						id: generateTagId(),
						name,
						userId,
					})),
				)
				.onConflictDoNothing({ target: [schema.tags.userId, schema.tags.name] });

			// Fetch all matching tags
			return drizzleTx
				.select({ id: schema.tags.id, name: schema.tags.name })
				.from(schema.tags)
				.where(
					and(
						eq(schema.tags.userId, userId),
						inArray(schema.tags.name, uniqueNames),
					),
				);
		},
	};
}

/**
 * Creates a PostgreSQL/PGlite TransactionManager
 * Works with both PostgreSQL and PGlite as they share the same transaction API.
 */
export function createPgTransactionManager(
	db: PgDatabase,
): TransactionManager {
	return {
		async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
			return db.transaction(async (drizzleTx) => {
				const tx = wrapPgTx(drizzleTx);
				// Direct async execution - no more queuing
				return await fn(tx);
			});
		},
	};
}
