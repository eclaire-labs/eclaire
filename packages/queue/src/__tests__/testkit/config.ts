/**
 * Test configuration for queue contract tests
 */

export type TestDbType = "sqlite" | "pglite";

const allConfigs: Array<{ dbType: TestDbType; label: string }> = [
  { dbType: "sqlite", label: "SQLite" },
  { dbType: "pglite", label: "PGlite (PostgreSQL)" },
];

/**
 * Database configurations to test against.
 * Filter by DB_TYPE env var if set (for running sqlite-only or pglite-only)
 *
 * Usage:
 * - pnpm test        → runs both SQLite and PGlite
 * - pnpm test:sqlite → runs only SQLite tests
 * - pnpm test:pglite → runs only PGlite tests
 */
export const DB_TEST_CONFIGS = process.env.DB_TYPE
  ? allConfigs.filter((c) => c.dbType === process.env.DB_TYPE)
  : allConfigs;

/**
 * Short timeouts for timing-sensitive tests.
 * These are much shorter than production defaults for fast test execution.
 */
export const TEST_TIMEOUTS = {
  /** Lock duration in ms (production: 5 minutes) */
  lockDuration: 500,
  /** Poll interval in ms (production: 5 seconds) */
  pollInterval: 50,
  /** Heartbeat interval in ms (production: 1 minute) */
  heartbeatInterval: 100,
  /** Max time to wait for eventually() in ms */
  eventuallyTimeout: 5000,
  /** Check interval for eventually() in ms */
  eventuallyInterval: 10,
};
