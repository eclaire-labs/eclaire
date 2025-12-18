/**
 * Testkit - Test utilities for queue tests
 *
 * @example Using DB-specific setup (for driver-db tests)
 * ```typescript
 * import {
 *   DB_TEST_CONFIGS,
 *   createQueueTestDatabase,
 *   type QueueTestDatabase,
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
 *
 * @example Using BullMQ harness (for driver-bullmq tests)
 * ```typescript
 * import {
 *   createBullMQTestHarness,
 *   eventually,
 *   type QueueTestHarness,
 * } from "../testkit/index.js";
 *
 * describe("BullMQ Test", () => {
 *   let harness: QueueTestHarness;
 *
 *   beforeEach(async () => {
 *     harness = await createBullMQTestHarness();
 *   });
 *
 *   afterEach(async () => {
 *     await harness.cleanup();
 *   });
 *
 *   it("should process a job", async () => {
 *     const client = harness.createClient();
 *     const worker = harness.createWorker("test", async (ctx) => {});
 *     // ...
 *   });
 * });
 * ```
 */

// Types
export type {
  TestDbType,
  QueueDriverType,
  HarnessCapabilities,
  QueueTestHarnessConfig,
} from "./types.js";

// Configuration
export {
  DB_TEST_CONFIGS,
  TEST_TIMEOUTS,
} from "./config.js";

// Database setup (for DB-only tests)
export {
  createQueueTestDatabase,
  type QueueTestDatabase,
} from "./db-setup.js";

// Test harnesses
export {
  createDbTestHarness,
  createBullMQTestHarness,
  type QueueTestHarness,
} from "./harness.js";

// Utilities
export {
  eventually,
  sleep,
  createTestLogger,
  createDeferred,
  type Deferred,
} from "./utils.js";
