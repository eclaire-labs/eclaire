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
  // PostgreSQL
  queueJobsPg,
  queueSchedulesPg,
  type QueueJobPg,
  type NewQueueJobPg,
  type QueueSchedulePg,
  type NewQueueSchedulePg,
  // SQLite
  queueJobsSqlite,
  queueSchedulesSqlite,
  type QueueJobSqlite,
  type NewQueueJobSqlite,
  type QueueScheduleSqlite,
  type NewQueueScheduleSqlite,
  // Factory
  getQueueSchema,
  // Union types
  type QueueJobsTable,
  type QueueSchedulesTable,
} from "./schema/index.js";
