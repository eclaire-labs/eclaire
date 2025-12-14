/**
 * Testkit - Test utilities for queue contract tests
 *
 * @example
 * ```typescript
 * import {
 *   DB_TEST_CONFIGS,
 *   TEST_TIMEOUTS,
 *   createQueueTestDatabase,
 *   eventually,
 *   createTestLogger,
 * } from "../testkit/index.js";
 *
 * describe.each(DB_TEST_CONFIGS)("Test ($label)", ({ dbType }) => {
 *   let testDb: QueueTestDatabase;
 *
 *   beforeEach(async () => {
 *     testDb = await createQueueTestDatabase(dbType);
 *   });
 *
 *   afterEach(async () => {
 *     await testDb.cleanup();
 *   });
 * });
 * ```
 */

// Configuration
export { DB_TEST_CONFIGS, TEST_TIMEOUTS, type TestDbType } from "./config.js";

// Database setup
export {
  createQueueTestDatabase,
  type QueueTestDatabase,
} from "./db-setup.js";

// Utilities
export {
  eventually,
  sleep,
  createTestLogger,
  createDeferred,
  type Deferred,
} from "./utils.js";
