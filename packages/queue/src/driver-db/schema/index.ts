/**
 * @eclaire/queue - Database schema exports
 *
 * Re-exports PostgreSQL and SQLite schemas with type helpers.
 */

// PostgreSQL exports
export {
  queueJobsPg,
  queueSchedulesPg,
  type QueueJobPg,
  type NewQueueJobPg,
  type QueueSchedulePg,
  type NewQueueSchedulePg,
} from "./postgres.js";

// SQLite exports
export {
  queueJobsSqlite,
  queueSchedulesSqlite,
  type QueueJobSqlite,
  type NewQueueJobSqlite,
  type QueueScheduleSqlite,
  type NewQueueScheduleSqlite,
} from "./sqlite.js";

// Import for getQueueSchema
import { queueJobsPg, queueSchedulesPg } from "./postgres.js";
import { queueJobsSqlite, queueSchedulesSqlite } from "./sqlite.js";

/**
 * Get the appropriate schema based on database type
 */
export function getQueueSchema(dbType: "postgres" | "sqlite") {
  if (dbType === "postgres") {
    return {
      queueJobs: queueJobsPg,
      queueSchedules: queueSchedulesPg,
    };
  }
  return {
    queueJobs: queueJobsSqlite,
    queueSchedules: queueSchedulesSqlite,
  };
}

// Union types for generic use
export type QueueJobsTable = typeof queueJobsPg | typeof queueJobsSqlite;
export type QueueSchedulesTable = typeof queueSchedulesPg | typeof queueSchedulesSqlite;
