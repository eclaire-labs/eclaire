/**
 * Test utilities for queue contract tests
 */

import type { QueueLogger } from "../../core/types.js";
import { TEST_TIMEOUTS } from "./config.js";

/**
 * Wait until a condition becomes true, with timeout.
 *
 * Prefer this over fixed sleep() to reduce test flakiness and speed.
 *
 * @param fn - Function that returns true when condition is met
 * @param options - Timeout and interval settings (milliseconds)
 * @throws Error if timeout is reached before condition is met
 *
 * @example
 * ```typescript
 * await eventually(async () => {
 *   const job = await client.getJob(jobId);
 *   return job?.status === "completed";
 * });
 * ```
 */
export async function eventually(
  fn: () => Promise<boolean> | boolean,
  options?: { timeout?: number; interval?: number },
): Promise<void> {
  const timeout = options?.timeout ?? TEST_TIMEOUTS.eventuallyTimeout;
  const interval = options?.interval ?? TEST_TIMEOUTS.eventuallyInterval;

  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return;
    await sleep(interval);
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Sleep for a duration (use sparingly - prefer eventually())
 *
 * @param ms - Duration in milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a no-op logger for tests.
 * Optionally captures log messages for assertions.
 */
export function createTestLogger(options?: {
  capture?: boolean;
}): QueueLogger & {
  logs: Array<{ level: string; obj: object; msg?: string }>;
} {
  const logs: Array<{ level: string; obj: object; msg?: string }> = [];
  const capture = options?.capture ?? false;

  const log = (level: string) => (obj: object, msg?: string) => {
    if (capture) {
      logs.push({ level, obj, msg });
    }
  };

  return {
    logs,
    debug: log("debug"),
    info: log("info"),
    warn: log("warn"),
    error: log("error"),
  };
}

/**
 * Deferred promise for controlling test flow.
 *
 * @example
 * ```typescript
 * const deferred = createDeferred<void>();
 *
 * // In handler:
 * await deferred.promise;  // Blocks until resolved
 *
 * // In test:
 * deferred.resolve();  // Unblocks handler
 * ```
 */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value?: T) => void;
  reject: (error: Error) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value?: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res as (value?: T) => void;
    reject = rej;
  });

  return { promise, resolve, reject };
}
