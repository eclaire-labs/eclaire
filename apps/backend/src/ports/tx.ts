/**
 * Transaction Port - Re-exports from @eclaire/db
 *
 * This file maintains backward compatibility for existing imports while
 * delegating to the shared @eclaire/db package.
 */

export type {
	Tx,
	TransactionManager,
	BaseRepository,
	DbCapabilities,
	DbDialect,
} from "@eclaire/db";
