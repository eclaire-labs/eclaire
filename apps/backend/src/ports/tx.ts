/**
 * Transaction Port - Dialect-neutral transaction interface
 *
 * IMPORTANT: Transaction callbacks MUST be synchronous (no `await` allowed inside).
 * This ensures compatibility across PostgreSQL and SQLite databases.
 *
 * Pre-generate IDs before calling withTransaction, and do side-effects (queues, network)
 * after the transaction commits.
 */

import type { SQL } from "drizzle-orm";

// Repository method signatures (sync-only, no Promises returned)
export interface BaseRepository<TInsert, TUpdate, TSelect> {
	insert(values: TInsert): void;
	update(where: SQL | undefined, values: TUpdate): void;
	delete(where: SQL | undefined): void;
}

/**
 * Transaction context - provides access to repositories for database operations.
 * All methods are synchronous to ensure compatibility with both PostgreSQL and SQLite.
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

	// Asset processing
	assetProcessingJobs: BaseRepository<any, any, any>;

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
}

/**
 * Transaction Manager - Main interface for database transactions
 *
 * Usage example:
 * ```ts
 * const bookmarkId = randomUUID();
 * await txManager.withTransaction((tx) => {
 *   tx.bookmarks.insert({ id: bookmarkId, title: "Example", ... });
 *   tx.bookmarksTags.insert({ bookmarkId, tagId });
 * });
 * // Do side-effects after commit
 * await publisher.publish('bookmark.created', { bookmarkId });
 * ```
 */
export interface TransactionManager {
	/**
	 * Execute a transaction with a synchronous callback.
	 *
	 * CRITICAL RULES:
	 * 1. The callback MUST be synchronous - no `await` allowed inside
	 * 2. Pre-generate all IDs (UUIDs) before calling this function
	 * 3. Do only database operations inside the callback
	 * 4. Perform side-effects (queues, network calls) AFTER the transaction
	 *
	 * @param fn - Synchronous callback that performs database operations
	 * @returns Promise that resolves with the callback's return value
	 */
	withTransaction<T>(fn: (tx: Tx) => T): Promise<T>;
}

/**
 * Database dialect types
 */
export type DbDialect = "postgresql" | "pglite" | "sqlite";

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
