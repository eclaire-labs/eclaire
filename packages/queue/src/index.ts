/**
 * @eclaire/queue - Job queue abstraction
 *
 * Provides a unified interface for job queuing that works with both:
 * - Redis/BullMQ mode: Production-scale job processing with Redis
 * - Database mode: Zero-Redis deployment using PostgreSQL or SQLite
 *
 * The package is organized into submodules:
 * - @eclaire/queue/core: Zero-dependency core types, utilities, event callbacks, and waitlist
 * - @eclaire/queue/driver-bullmq: BullMQ implementation
 * - @eclaire/queue/driver-db: Database implementation
 * - @eclaire/queue/transport-http: HTTP transport layer
 */

// Re-export core types and utilities (zero dependencies)
export * from "./core/index.js";

// Re-export generic Redis utilities (no app dependencies)
export {
  createRedisConnection,
  type RedisConnectionOptions,
} from "./shared/redis-connection.js";
