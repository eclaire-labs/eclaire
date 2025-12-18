/**
 * Test configuration for queue contract tests
 */

import type {
  QueueTestHarnessConfig,
  HarnessCapabilities,
  TestDbType,
  QueueDriverType,
} from "./types.js";

// Re-export types for backwards compatibility
export type { TestDbType, QueueDriverType } from "./types.js";

const allDbConfigs: Array<{ dbType: TestDbType; label: string }> = [
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
  ? allDbConfigs.filter((c) => c.dbType === process.env.DB_TYPE)
  : allDbConfigs;

/**
 * DB harness capabilities
 */
const DB_CAPABILITIES: HarnessCapabilities = {
  supportsRetryPendingState: true,
  supportsSchedulerPersistence: true,
  supportsDelayInspection: true,
  supportsLinearBackoff: true,
};

/**
 * BullMQ harness capabilities
 */
const BULLMQ_CAPABILITIES: HarnessCapabilities = {
  supportsRetryPendingState: false,
  supportsSchedulerPersistence: false,
  supportsDelayInspection: true,
  supportsLinearBackoff: false,
};

/**
 * All harness configurations for portable contract tests
 */
const allHarnessConfigs: QueueTestHarnessConfig[] = [
  {
    driver: "db",
    dbType: "sqlite",
    label: "DB (SQLite)",
    capabilities: DB_CAPABILITIES,
  },
  {
    driver: "db",
    dbType: "pglite",
    label: "DB (PGlite)",
    capabilities: DB_CAPABILITIES,
  },
  {
    driver: "bullmq",
    label: "BullMQ (Redis)",
    capabilities: BULLMQ_CAPABILITIES,
  },
];

/**
 * Get harness configurations based on environment variables.
 *
 * Environment variables:
 * - QUEUE_DRIVER=db|bullmq → filter by driver type
 * - DB_TYPE=sqlite|pglite  → filter DB driver by database type
 *
 * Usage:
 * - pnpm test                      → runs DB tests only (SQLite + PGlite)
 * - pnpm test:sqlite               → runs only SQLite tests
 * - pnpm test:pglite               → runs only PGlite tests
 * - pnpm test:bullmq               → runs only BullMQ tests
 * - QUEUE_DRIVER=bullmq pnpm test  → runs only BullMQ tests
 */
export function getTestHarnessConfigs(): QueueTestHarnessConfig[] {
  const queueDriver = process.env.QUEUE_DRIVER as QueueDriverType | undefined;
  const dbType = process.env.DB_TYPE as TestDbType | undefined;

  return allHarnessConfigs.filter((config) => {
    // Filter by QUEUE_DRIVER if set
    if (queueDriver && config.driver !== queueDriver) {
      return false;
    }

    // Filter DB driver by DB_TYPE if set
    if (config.driver === "db" && dbType && config.dbType !== dbType) {
      return false;
    }

    // By default, only run DB tests (BullMQ requires Redis)
    if (!queueDriver && config.driver === "bullmq") {
      return false;
    }

    return true;
  });
}

/**
 * Test harness configurations to test against.
 *
 * By default, only runs DB tests. Set QUEUE_DRIVER=bullmq to run BullMQ tests.
 */
export const TEST_HARNESS_CONFIGS = getTestHarnessConfigs();

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
