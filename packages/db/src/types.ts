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

import type {
  InferInsertModel,
  InferSelectModel,
  SQL,
  Table,
} from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as pgSchema from "./schema/postgres.js";

// Re-export domain types from @eclaire/core for convenience
export type {
  AssetType,
  BookmarkInsert,
  ChannelCapability,
  ChannelPlatform,
  DocumentInsert,
  FeedbackSentiment,
  FlagColor,
  HistoryInsert,
  JobStatus,
  MediaInsert,
  MessageRole,
  NoteInsert,
  PhotoInsert,
  ReviewStatus,
  TagInsert,
  TaskInsert,
  TaskStatus,
  UserInsert,
  UserType,
} from "@eclaire/core/types";

/**
 * Database instance types for each supported dialect.
 * Schema type params are `any` because the actual schema differs per dialect.
 */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle schema type varies by dialect
export type PostgresDbInstance = PostgresJsDatabase<any>;
// biome-ignore lint/suspicious/noExplicitAny: Drizzle schema type varies by dialect
export type PgliteDbInstance = PgliteDatabase<any>;
// biome-ignore lint/suspicious/noExplicitAny: Drizzle schema type varies by dialect
export type SqliteDbInstance = BetterSQLite3Database<any>;

/**
 * Union type for all possible database instances
 */
export type DbInstance =
  | PostgresDbInstance
  | PgliteDbInstance
  | SqliteDbInstance;

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

// ---------------------------------------------------------------------------
// Typed repository helper — derives Insert/Update/Select from a Drizzle table
// Uses the PostgreSQL schema as the canonical type source.
// ---------------------------------------------------------------------------

/** Typed repository for a Drizzle table (insert, partial-update, select). */
type Repo<T extends Table> = BaseRepository<
  InferInsertModel<T>,
  Partial<InferInsertModel<T>>,
  InferSelectModel<T>
>;

/**
 * Table names that are available inside a transaction.
 * Single source of truth — used by both adapters to build the repository map.
 */
export const TX_TABLE_NAMES = [
  "users",
  "bookmarks",
  "bookmarksTags",
  "tasks",
  "tasksTags",
  "documents",
  "documentsTags",
  "photos",
  "photosTags",
  "media",
  "mediaTags",
  "notes",
  "notesTags",
  "tags",
  "history",
  "conversations",
  "messages",
  "channels",
  "feedback",
] as const;

export type TxTableName = (typeof TX_TABLE_NAMES)[number];

/**
 * Transaction context — provides typed repositories for database operations.
 * All methods are async for consistent Read-Modify-Write support.
 *
 * Types are derived from the PostgreSQL schema (the canonical type source).
 * SQLite adapters implement the same interface — Drizzle's insert/select shapes
 * are structurally compatible between dialects at the TypeScript level.
 */
export interface Tx {
  users: Repo<typeof pgSchema.users>;

  bookmarks: Repo<typeof pgSchema.bookmarks>;
  bookmarksTags: Repo<typeof pgSchema.bookmarksTags>;

  tasks: Repo<typeof pgSchema.tasks>;
  tasksTags: Repo<typeof pgSchema.tasksTags>;

  documents: Repo<typeof pgSchema.documents>;
  documentsTags: Repo<typeof pgSchema.documentsTags>;

  photos: Repo<typeof pgSchema.photos>;
  photosTags: Repo<typeof pgSchema.photosTags>;

  media: Repo<typeof pgSchema.media>;
  mediaTags: Repo<typeof pgSchema.mediaTags>;

  notes: Repo<typeof pgSchema.notes>;
  notesTags: Repo<typeof pgSchema.notesTags>;

  tags: Repo<typeof pgSchema.tags>;

  history: Repo<typeof pgSchema.history>;

  conversations: Repo<typeof pgSchema.conversations>;
  messages: Repo<typeof pgSchema.messages>;

  channels: Repo<typeof pgSchema.channels>;
  feedback: Repo<typeof pgSchema.feedback>;

  // biome-ignore lint/suspicious/noExplicitAny: outbox table provided by queue package, optional
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
