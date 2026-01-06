/**
 * @eclaire/queue/driver-bullmq - BullMQ driver for the queue system
 *
 * This driver uses BullMQ and Redis for high-performance, distributed job processing.
 * It provides:
 * - QueueClient for enqueueing and managing jobs
 * - Worker for processing jobs
 * - Scheduler for recurring jobs using BullMQ's native scheduler
 *
 * @example Basic usage
 * ```typescript
 * import {
 *   createBullMQClient,
 *   createBullMQWorker,
 * } from '@eclaire/queue/driver-bullmq';
 *
 * // Create client
 * const client = createBullMQClient({
 *   redis: { url: 'redis://localhost:6379' },
 *   logger,
 * });
 *
 * // Enqueue a job
 * await client.enqueue('email-send', {
 *   to: 'user@example.com',
 *   subject: 'Hello',
 * }, {
 *   key: 'email:123',  // Idempotency key
 *   attempts: 3,
 *   backoff: { type: 'exponential', delay: 1000 },
 * });
 *
 * // Create and start worker
 * const worker = createBullMQWorker('email-send', async (ctx) => {
 *   const { to, subject } = ctx.job.data;
 *   await sendEmail(to, subject);
 *   ctx.log(`Email sent to ${to}`);
 * }, {
 *   redis: { url: 'redis://localhost:6379' },
 *   logger,
 * });
 *
 * await worker.start();
 * ```
 *
 * @example Recurring jobs
 * ```typescript
 * import { createBullMQScheduler } from '@eclaire/queue/driver-bullmq';
 *
 * const scheduler = createBullMQScheduler({
 *   redis: { url: 'redis://localhost:6379' },
 *   logger,
 * });
 *
 * // Create a recurring job that runs every hour
 * await scheduler.upsert({
 *   key: 'cleanup-job',
 *   name: 'cleanup',
 *   cron: '0 * * * *',
 *   data: { maxAge: 86400 },
 * });
 *
 * await scheduler.start();
 * ```
 */

// Client exports
export { createBullMQClient } from "./client.js";

// Connection exports
export {
  closeRedisConnection,
  createRedisConnection,
} from "./connection.js";
// Scheduler exports
export { createBullMQScheduler } from "./scheduler.js";
// Type exports
export type {
  BullMQClientConfig,
  BullMQSchedulerConfig,
  BullMQWorkerConfig,
  RedisConfig,
} from "./types.js";
// Worker exports
export {
  type BullMQWorkerFactory,
  createBullMQWorker,
  createBullMQWorkerFactory,
} from "./worker.js";
