/**
 * Unified test harness for queue contract tests
 *
 * Provides a driver-neutral abstraction for creating clients, workers,
 * and schedulers for both DB (SQLite/PGlite) and BullMQ drivers.
 */

import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type {
  JobHandler,
  QueueClient,
  Scheduler,
  Worker,
  WorkerOptions,
} from "../../core/types.js";
import {
  createBullMQClient,
  createBullMQScheduler,
  createBullMQWorker,
} from "../../driver-bullmq/index.js";
import {
  createDbQueueClient,
  createDbScheduler,
  createDbWorker,
} from "../../driver-db/index.js";
import { TEST_TIMEOUTS } from "./config.js";
import { createQueueTestDatabase, type QueueTestDatabase } from "./db-setup.js";
import type {
  HarnessCapabilities,
  QueueTestHarnessConfig,
  TestDbType,
} from "./types.js";
import { createTestLogger } from "./utils.js";

// Re-export types for convenience
export type { HarnessCapabilities, QueueTestHarnessConfig } from "./types.js";

/**
 * Runtime test harness instance
 */
export interface QueueTestHarness {
  config: QueueTestHarnessConfig;

  /** Create a queue client */
  createClient(): QueueClient;

  /** Create a worker for processing jobs */
  createWorker(
    name: string,
    handler: JobHandler,
    options?: WorkerOptions,
  ): Worker;

  /** Create a scheduler for recurring jobs */
  createScheduler(): Scheduler;

  /** Clean up all resources - call in afterEach */
  cleanup(): Promise<void>;

  /** Get the Redis key prefix (BullMQ only) */
  getPrefix?(): string;

  /** Scan Redis keys matching a pattern (BullMQ only) */
  scanRedisKeys?(pattern: string): Promise<string[]>;

  /** Get the Redis URL (BullMQ only) */
  getRedisUrl?(): string;
}

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
 * Create a DB-backed test harness
 */
export async function createDbTestHarness(
  dbType: TestDbType,
): Promise<QueueTestHarness> {
  const testDb = await createQueueTestDatabase(dbType);
  const logger = createTestLogger();

  // Track resources for cleanup
  const workers: Worker[] = [];
  const schedulers: Scheduler[] = [];
  let client: QueueClient | null = null;

  const config: QueueTestHarnessConfig = {
    driver: "db",
    dbType,
    label: dbType === "sqlite" ? "DB (SQLite)" : "DB (PGlite)",
    capabilities: DB_CAPABILITIES,
  };

  return {
    config,

    createClient() {
      if (!client) {
        client = createDbQueueClient({
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
        });
      }
      return client;
    },

    createWorker(name, handler, options) {
      const worker = createDbWorker(
        name,
        handler,
        {
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
          pollInterval: TEST_TIMEOUTS.pollInterval,
          lockDuration: options?.lockDuration ?? TEST_TIMEOUTS.lockDuration,
          heartbeatInterval:
            options?.heartbeatInterval ?? TEST_TIMEOUTS.heartbeatInterval,
        },
        {
          concurrency: options?.concurrency,
        },
      );
      workers.push(worker);
      return worker;
    },

    createScheduler() {
      // Ensure client exists for scheduler
      if (!client) {
        client = createDbQueueClient({
          db: testDb.db,
          schema: testDb.schema,
          capabilities: testDb.capabilities,
          logger,
        });
      }

      const scheduler = createDbScheduler({
        db: testDb.db,
        queueSchedules: testDb.schema.queueSchedules,
        queueClient: client,
        logger,
        checkInterval: TEST_TIMEOUTS.pollInterval,
      });
      schedulers.push(scheduler);
      return scheduler;
    },

    async cleanup() {
      // Stop all schedulers
      for (const scheduler of schedulers) {
        try {
          await scheduler.stop();
        } catch {
          // Ignore cleanup errors
        }
      }
      schedulers.length = 0;

      // Stop all workers
      for (const worker of workers) {
        try {
          await worker.stop();
        } catch {
          // Ignore cleanup errors
        }
      }
      workers.length = 0;

      // Close client
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore cleanup errors
        }
        client = null;
      }

      // Cleanup database
      await testDb.cleanup();
    },
  };
}

/**
 * Generate a unique test run ID for BullMQ isolation
 */
function generateTestRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Create a BullMQ-backed test harness
 */
export async function createBullMQTestHarness(): Promise<QueueTestHarness> {
  const testRunId = generateTestRunId();
  const prefix = `queue-test:${testRunId}`;
  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  const logger = createTestLogger();

  // Create Redis connection - pass URL directly to driver config
  // BullMQ drivers handle the connection creation internally
  const redisConfig = { url: redisUrl };

  // For cleanup, we need our own connection
  const cleanupRedis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  // Track resources for cleanup
  const workers: Worker[] = [];
  const schedulers: Scheduler[] = [];
  const bullmqQueues: Queue[] = [];
  let client: QueueClient | null = null;

  const config: QueueTestHarnessConfig = {
    driver: "bullmq",
    label: "BullMQ (Redis)",
    capabilities: BULLMQ_CAPABILITIES,
  };

  return {
    config,

    createClient() {
      if (!client) {
        client = createBullMQClient({
          redis: redisConfig,
          logger,
          prefix,
        });
      }
      return client;
    },

    createWorker(name, handler, options) {
      const worker = createBullMQWorker(
        name,
        handler,
        {
          redis: redisConfig,
          logger,
          prefix,
        },
        {
          concurrency: options?.concurrency ?? 1,
          lockDuration: options?.lockDuration ?? TEST_TIMEOUTS.lockDuration,
          stalledInterval: TEST_TIMEOUTS.pollInterval * 2,
        },
      );

      // Track the underlying BullMQ queue for cleanup
      const queue = new Queue(name, { connection: cleanupRedis, prefix });
      bullmqQueues.push(queue);

      workers.push(worker);
      return worker;
    },

    createScheduler() {
      const scheduler = createBullMQScheduler({
        redis: redisConfig,
        logger,
        prefix,
      });
      schedulers.push(scheduler);
      return scheduler;
    },

    getPrefix() {
      return prefix;
    },

    getRedisUrl() {
      return redisUrl;
    },

    async scanRedisKeys(pattern: string): Promise<string[]> {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [nextCursor, matchedKeys] = await cleanupRedis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100,
        );
        cursor = nextCursor;
        keys.push(...matchedKeys);
      } while (cursor !== "0");
      return keys;
    },

    async cleanup() {
      // Stop all schedulers
      for (const scheduler of schedulers) {
        try {
          await scheduler.stop();
        } catch {
          // Ignore cleanup errors
        }
      }
      schedulers.length = 0;

      // Stop all workers
      for (const worker of workers) {
        try {
          await worker.stop();
        } catch {
          // Ignore cleanup errors
        }
      }
      workers.length = 0;

      // Close client
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore cleanup errors
        }
        client = null;
      }

      // Obliterate all tracked queues to clean up Redis
      for (const queue of bullmqQueues) {
        try {
          await queue.obliterate({ force: true });
          await queue.close();
        } catch {
          // Ignore cleanup errors
        }
      }
      bullmqQueues.length = 0;

      // Close Redis connection
      try {
        cleanupRedis.disconnect();
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Create a test harness based on configuration
 */
export async function createTestHarness(
  config: QueueTestHarnessConfig,
): Promise<QueueTestHarness> {
  if (config.driver === "bullmq") {
    return createBullMQTestHarness();
  } else {
    return createDbTestHarness(config.dbType!);
  }
}
