/**
 * Unified test harness for queue contract tests
 *
 * Provides a driver-neutral abstraction for creating clients, workers,
 * and schedulers for both DB (SQLite/PGlite) and BullMQ drivers.
 */

import type {
  QueueClient,
  Worker,
  Scheduler,
  JobHandler,
  WorkerOptions,
} from "../../core/types.js";
import type {
  TestDbType,
  QueueTestHarnessConfig,
  HarnessCapabilities,
} from "./types.js";
import { TEST_TIMEOUTS } from "./config.js";
import { createTestLogger } from "./utils.js";
import {
  createQueueTestDatabase,
  type QueueTestDatabase,
} from "./db-setup.js";
import {
  createDbQueueClient,
  createDbWorker,
  createDbScheduler,
} from "../../driver-db/index.js";
import {
  createBullMQClient,
  createBullMQWorker,
  createBullMQScheduler,
} from "../../driver-bullmq/index.js";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

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
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

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
