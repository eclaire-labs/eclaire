/**
 * @eclaire/queue/driver-db - Database schema for the queue system
 *
 * This file re-exports from the schema/ directory for backwards compatibility.
 * The schema is split into separate files for PostgreSQL and SQLite to support
 * drizzle-kit migrations.
 *
 * For migrations, import from:
 * - PostgreSQL: @eclaire/queue/driver-db/schema/postgres
 * - SQLite: @eclaire/queue/driver-db/schema/sqlite
 */

export {
  // Factory
  getQueueSchema,
  type NewQueueJobPg,
  type NewQueueJobSqlite,
  type NewQueueSchedulePg,
  type NewQueueScheduleSqlite,
  type QueueJobPg,
  type QueueJobSqlite,
  // Union types
  type QueueJobsTable,
  type QueueSchedulePg,
  type QueueScheduleSqlite,
  type QueueSchedulesTable,
  // PostgreSQL
  queueJobsPg,
  // SQLite
  queueJobsSqlite,
  queueSchedulesPg,
  queueSchedulesSqlite,
} from "./schema/index.js";
