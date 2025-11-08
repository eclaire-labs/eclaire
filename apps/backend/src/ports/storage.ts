/**
 * Storage Port - Domain-level CRUD interfaces
 *
 * These interfaces abstract away database dialect differences and provide
 * type-safe, domain-focused methods for data access.
 */

import type { SQL } from "drizzle-orm";
import type { DbDialect, DbCapabilities, TransactionManager } from "./tx";

/**
 * Common query options for list operations
 */
export interface QueryOptions {
	limit?: number;
	offset?: number;
	orderBy?: "asc" | "desc";
	orderByField?: string;
}

/**
 * Common filter for search queries
 */
export interface SearchFilter {
	search?: string;
	tags?: string[];
	enabled?: boolean;
	userId?: string;
}

/**
 * Base interface for all storage adapters
 */
export interface BaseStorage {
	/** Database dialect being used */
	dialect: DbDialect;

	/** Database capabilities */
	capabilities: DbCapabilities;

	/** Transaction manager */
	tx: TransactionManager;
}

/**
 * Bookmark storage interface
 */
export interface BookmarkStorage extends BaseStorage {
	// Create operations
	createBookmark(
		data: any,
		userId: string,
		tags?: string[]
	): Promise<{ id: string }>;

	// Read operations
	findById(id: string, userId: string): Promise<any | null>;
	list(userId: string, filters?: SearchFilter, options?: QueryOptions): Promise<any[]>;
	count(userId: string, filters?: SearchFilter): Promise<number>;

	// Update operations
	update(id: string, userId: string, data: any): Promise<void>;
	updateTags(id: string, userId: string, tags: string[]): Promise<void>;

	// Delete operations
	delete(id: string, userId: string): Promise<void>;
}

/**
 * Task storage interface
 */
export interface TaskStorage extends BaseStorage {
	createTask(data: any, userId: string, tags?: string[]): Promise<{ id: string }>;
	findById(id: string, userId: string): Promise<any | null>;
	list(userId: string, filters?: SearchFilter, options?: QueryOptions): Promise<any[]>;
	update(id: string, userId: string, data: any): Promise<void>;
	delete(id: string, userId: string): Promise<void>;
}

/**
 * Document storage interface
 */
export interface DocumentStorage extends BaseStorage {
	createDocument(
		data: any,
		userId: string,
		tags?: string[]
	): Promise<{ id: string }>;
	findById(id: string, userId: string): Promise<any | null>;
	list(userId: string, filters?: SearchFilter, options?: QueryOptions): Promise<any[]>;
	update(id: string, userId: string, data: any): Promise<void>;
	delete(id: string, userId: string): Promise<void>;
}

/**
 * Photo storage interface
 */
export interface PhotoStorage extends BaseStorage {
	createPhoto(data: any, userId: string, tags?: string[]): Promise<{ id: string }>;
	findById(id: string, userId: string): Promise<any | null>;
	list(userId: string, filters?: SearchFilter, options?: QueryOptions): Promise<any[]>;
	update(id: string, userId: string, data: any): Promise<void>;
	delete(id: string, userId: string): Promise<void>;
}

/**
 * Note storage interface
 */
export interface NoteStorage extends BaseStorage {
	createNote(data: any, userId: string, tags?: string[]): Promise<{ id: string }>;
	findById(id: string, userId: string): Promise<any | null>;
	list(userId: string, filters?: SearchFilter, options?: QueryOptions): Promise<any[]>;
	update(id: string, userId: string, data: any): Promise<void>;
	delete(id: string, userId: string): Promise<void>;
}

/**
 * Unified database interface combining all storage interfaces
 */
export interface Database {
	dialect: DbDialect;
	capabilities: DbCapabilities;
	tx: TransactionManager;

	// Storage interfaces
	bookmarks: BookmarkStorage;
	tasks: TaskStorage;
	documents: DocumentStorage;
	photos: PhotoStorage;
	notes: NoteStorage;
}
