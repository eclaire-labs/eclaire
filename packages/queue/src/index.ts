/**
 * @eclaire/queue - Job queue abstraction
 *
 * Provides a unified interface for job queuing that works with both:
 * - Redis/BullMQ mode: Production-scale job processing with Redis
 * - Database mode: Zero-Redis deployment using PostgreSQL or SQLite
 *
 * The package is organized into submodules:
 * - @eclaire/queue/core: Zero-dependency core types and utilities
 * - @eclaire/queue/driver-bullmq: BullMQ implementation
 * - @eclaire/queue/driver-db: Database implementation
 * - @eclaire/queue/transport-http: HTTP transport layer
 * - @eclaire/queue/app: Application-specific types and adapters (Eclaire-specific)
 *
 * This root export only includes generic utilities. For application-specific
 * types like QueueAdapter, BookmarkJobData, AssetType, QueueNames, etc.,
 * use @eclaire/queue/app instead.
 */

// Re-export core types and utilities (zero dependencies)
export * from "./core/index.js";

// Re-export generic Redis utilities (no app dependencies)
export {
  createRedisConnection,
  type RedisConnectionOptions,
} from "./shared/redis-connection.js";
