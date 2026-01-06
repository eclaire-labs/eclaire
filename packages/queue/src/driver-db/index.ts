/**
 * @eclaire/queue/driver-db - Database driver for the queue system
 *
 * This driver supports both PostgreSQL and SQLite databases using drizzle-orm.
 * It provides:
 * - QueueClient for enqueueing and managing jobs
 * - Worker for processing jobs
 * - PG NOTIFY integration for horizontal scaling (PostgreSQL only)
 * - In-memory notify fallback for single-process deployments
 *
 * @example PostgreSQL with horizontal scaling
 * ```typescript
 * import { Client } from 'pg';
 * import { drizzle } from 'drizzle-orm/node-postgres';
 * import {
 *   createDbQueueClient,
 *   createDbWorker,
 *   createPgNotifyEmitter,
 *   createPgNotifyListener,
 *   queueJobsPg,
 *   queueSchedulesPg,
 * } from '@eclaire/queue/driver-db';
 *
 * // Setup database
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * const db = drizzle(pool);
 *
 * // Setup notify (for horizontal scaling)
 * const notifyClient = new Client({ connectionString: process.env.DATABASE_URL });
 * await notifyClient.connect();
 * const emitter = createPgNotifyEmitter(notifyClient, { logger });
 * const listener = createPgNotifyListener(notifyClient, { logger });
 *
 * // Create client
 * const client = createDbQueueClient({
 *   db,
 *   schema: { queueJobs: queueJobsPg, queueSchedules: queueSchedulesPg },
 *   capabilities: { skipLocked: true, notify: true, jsonb: true, type: 'postgres' },
 *   logger,
 *   notifyEmitter: emitter,
 * });
 *
 * // Enqueue a job
 * await client.enqueue('bookmark-processing', { bookmarkId: '123' });
 *
 * // Create and start worker
 * const worker = createDbWorker('bookmark-processing', async (ctx) => {
 *   console.log('Processing:', ctx.job.data);
 * }, {
 *   db,
 *   schema: { queueJobs: queueJobsPg, queueSchedules: queueSchedulesPg },
 *   capabilities: { skipLocked: true, notify: true, jsonb: true, type: 'postgres' },
 *   logger,
 *   notifyListener: listener,
 * });
 *
 * await worker.start();
 * ```
 *
 * @example SQLite (single process)
 * ```typescript
 * import Database from 'better-sqlite3';
 * import { drizzle } from 'drizzle-orm/better-sqlite3';
 * import {
 *   createDbQueueClient,
 *   createDbWorker,
 *   createInMemoryNotify,
 *   queueJobsSqlite,
 *   queueSchedulesSqlite,
 * } from '@eclaire/queue/driver-db';
 *
 * const sqlite = new Database('queue.db');
 * const db = drizzle(sqlite);
 *
 * // Use in-memory notify for single process
 * const { emitter, listener } = createInMemoryNotify({ logger });
 *
 * const client = createDbQueueClient({
 *   db,
 *   schema: { queueJobs: queueJobsSqlite, queueSchedules: queueSchedulesSqlite },
 *   capabilities: { skipLocked: false, notify: false, jsonb: false, type: 'sqlite' },
 *   logger,
 *   notifyEmitter: emitter,
 * });
 * ```
 */

// Claim exports (for advanced use cases)
export { claimJobPostgres } from "./claim-postgres.js";
export { claimJobSqlite } from "./claim-sqlite.js";

// Client exports
export {
  createDbQueueClient,
  extendJobLock,
  markJobCompleted,
  markJobFailed,
} from "./client.js";
// Notify exports
export {
  createInMemoryNotify,
  createPgNotifyEmitter,
  createPgNotifyListener,
  createPollingNotifyListener,
  type PgClient,
  type PgNotification,
  type PgNotifyConfig,
  type PollingNotifyConfig,
} from "./notify.js";
// Scheduler exports
export {
  createDbScheduler,
  type DbSchedulerConfig,
} from "./scheduler.js";
// Schema exports
export {
  // Helpers
  getQueueSchema,
  type NewQueueJobPg,
  type NewQueueJobSqlite,
  type NewQueueSchedulePg,
  type NewQueueScheduleSqlite,
  // Types
  type QueueJobPg,
  type QueueJobSqlite,
  type QueueJobsTable,
  type QueueSchedulePg,
  type QueueScheduleSqlite,
  type QueueSchedulesTable,
  // PostgreSQL tables
  queueJobsPg,
  // SQLite tables
  queueJobsSqlite,
  queueSchedulesPg,
  queueSchedulesSqlite,
} from "./schema.js";
// Type exports
export type {
  ClaimedJob,
  ClaimOptions,
  ClaimResult,
  DbCapabilities,
  DbInstance,
  DbQueueClientConfig,
  DbWorkerConfig,
  NotifyEmitter,
  NotifyListener,
} from "./types.js";
// Worker exports
export {
  createDbWorker,
  createDbWorkerFactory,
  type DbWorkerFactory,
} from "./worker.js";
