/**
 * Database types and transaction interfaces
 *
 * Supports async callbacks with Read-Modify-Write patterns inside transactions.
 * Both PostgreSQL and SQLite use the same async interface.
 *
 * BEST PRACTICES:
 * - Pre-generate IDs (UUIDs) before calling withTransaction
 * - Keep transactions tight - avoid slow network calls inside transactions
 * - Perform side-effects (queues, external APIs) AFTER the transaction commits
 *
 * SQLite uses a mutex to serialize transactions while allowing async callbacks.
 * PostgreSQL uses native async transactions directly.
 */

import type { SQL } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

// Re-export domain types from @eclaire/core for convenience
export type {
	UserType,
	ReviewStatus,
	FlagColor,
	AssetType,
	JobStatus,
	TaskStatus,
	MessageRole,
	ChannelPlatform,
	ChannelCapability,
	FeedbackSentiment,
	UserInsert,
	BookmarkInsert,
	TaskInsert,
	DocumentInsert,
	PhotoInsert,
	NoteInsert,
	TagInsert,
	HistoryInsert,
} from "@eclaire/core/types";

/**
 * Database instance types for each supported dialect
 */
export type PostgresDbInstance = PostgresJsDatabase<any>;
export type PgliteDbInstance = PgliteDatabase<any>;
export type SqliteDbInstance = BetterSQLite3Database<any>;

/**
 * Union type for all possible database instances
 */
export type DbInstance = PostgresDbInstance | PgliteDbInstance | SqliteDbInstance;

/**
 * Database dialect types
 */
export type DbDialect = "postgres" | "pglite" | "sqlite";

/**
 * Database capabilities - indicates which features are available per dialect
 */
export interface DbCapabilities {
	/** Native JSONB support and indexing */
	jsonIndexing: boolean;
	/** Full-text search: 'none', 'builtin', or 'external' */
	fts: "none" | "builtin" | "external";
	/** LISTEN/NOTIFY support for pub/sub */
	notify: boolean;
	/** FOR UPDATE SKIP LOCKED support for job queues */
	skipLocked: boolean;
}

/**
 * Repository method signatures - all async for consistent API across databases.
 * Write methods return Promise<void>, read methods return Promise<T>.
 */
export interface BaseRepository<TInsert, TUpdate, TSelect> {
	// Write methods
	insert(values: TInsert): Promise<void>;
	update(where: SQL | undefined, values: TUpdate): Promise<void>;
	delete(where: SQL | undefined): Promise<void>;

	// Read methods for Read-Modify-Write patterns
	findFirst(where: SQL | undefined): Promise<TSelect | undefined>;
	findMany(where: SQL | undefined): Promise<TSelect[]>;
}

/**
 * Transaction context - provides access to repositories for database operations.
 * All methods are async for consistent Read-Modify-Write support.
 */
export interface Tx {
	// User repositories
	users: BaseRepository<any, any, any>;

	// Bookmark repositories
	bookmarks: BaseRepository<any, any, any>;
	bookmarksTags: BaseRepository<any, any, any>;

	// Task repositories
	tasks: BaseRepository<any, any, any>;
	tasksTags: BaseRepository<any, any, any>;

	// Document repositories
	documents: BaseRepository<any, any, any>;
	documentsTags: BaseRepository<any, any, any>;

	// Photo repositories
	photos: BaseRepository<any, any, any>;
	photosTags: BaseRepository<any, any, any>;

	// Note repositories
	notes: BaseRepository<any, any, any>;
	notesTags: BaseRepository<any, any, any>;

	// Tags
	tags: BaseRepository<any, any, any>;

	// History
	history: BaseRepository<any, any, any>;

	// Conversations & Messages
	conversations: BaseRepository<any, any, any>;
	messages: BaseRepository<any, any, any>;

	// Channels & Feedback
	channels: BaseRepository<any, any, any>;
	feedback: BaseRepository<any, any, any>;

	// Outbox for atomic side-effects (optional, for future use)
	outbox?: BaseRepository<any, any, any>;

	/**
	 * Get or create tags within the current transaction.
	 * Tags are scoped per user - each user has their own namespace for tag names.
	 *
	 * Uses INSERT ... ON CONFLICT DO NOTHING for atomic upsert, then fetches all matching tags.
	 *
	 * @param tagNames - Array of tag names to create or retrieve
	 * @param userId - User ID for tag scoping
	 * @returns Array of tag objects with id and name
	 */
	getOrCreateTags(
		tagNames: string[],
		userId: string,
	): Promise<{ id: string; name: string }[]>;
}

/**
 * Transaction Manager - Main interface for database transactions
 *
 * Usage example:
 * ```ts
 * const bookmarkId = randomUUID();
 * await txManager.withTransaction(async (tx) => {
 *   // Read-Modify-Write patterns are fully supported
 *   const existing = await tx.bookmarks.findFirst(eq(bookmarks.id, someId));
 *   if (!existing) {
 *     await tx.bookmarks.insert({ id: bookmarkId, title: "Example", ... });
 *   }
 *   await tx.bookmarksTags.insert({ bookmarkId, tagId });
 * });
 * // Do side-effects after commit
 * await publisher.publish('bookmark.created', { bookmarkId });
 * ```
 */
export interface TransactionManager {
	/**
	 * Execute a transaction with an async callback.
	 *
	 * BEST PRACTICES:
	 * 1. Pre-generate all IDs (UUIDs) before calling this function
	 * 2. Keep transactions tight - avoid slow network calls inside
	 * 3. Perform side-effects (queues, external APIs) AFTER the transaction
	 *
	 * @param fn - Async callback that performs database operations
	 * @returns Promise that resolves with the callback's return value
	 */
	withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}
