/**
 * @eclaire/queue/core - Utility functions for the queue system
 *
 * These are pure functions with no external dependencies.
 */

import type { BackoffStrategy } from "./types.js";

// ============================================================================
// Backoff Calculators
// ============================================================================

/**
 * Default backoff configuration
 */
export const DEFAULT_BACKOFF: Required<BackoffStrategy> = {
  type: "exponential",
  delay: 1000, // 1 second base delay
  maxDelay: 300000, // 5 minutes max
};

/**
 * Calculate backoff delay based on attempt number and strategy
 *
 * @param attempt - The current attempt number (1-based)
 * @param strategy - The backoff strategy to use
 * @returns Delay in milliseconds before next retry
 *
 * @example
 * ```typescript
 * // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
 * calculateBackoff(1, { type: 'exponential', delay: 1000 }); // 1000
 * calculateBackoff(2, { type: 'exponential', delay: 1000 }); // 2000
 * calculateBackoff(3, { type: 'exponential', delay: 1000 }); // 4000
 *
 * // Linear backoff: 1s, 2s, 3s, 4s...
 * calculateBackoff(1, { type: 'linear', delay: 1000 }); // 1000
 * calculateBackoff(2, { type: 'linear', delay: 1000 }); // 2000
 * calculateBackoff(3, { type: 'linear', delay: 1000 }); // 3000
 *
 * // Fixed backoff: always same delay
 * calculateBackoff(1, { type: 'fixed', delay: 5000 }); // 5000
 * calculateBackoff(5, { type: 'fixed', delay: 5000 }); // 5000
 * ```
 */
export function calculateBackoff(
  attempt: number,
  strategy: BackoffStrategy = DEFAULT_BACKOFF,
): number {
  const { type, delay, maxDelay } = {
    ...DEFAULT_BACKOFF,
    ...strategy,
  };

  // Ensure attempt is at least 1
  const safeAttempt = Math.max(1, attempt);

  let calculatedDelay: number;

  switch (type) {
    case "exponential":
      // 2^(attempt-1) * baseDelay: 1x, 2x, 4x, 8x, 16x...
      calculatedDelay = 2 ** (safeAttempt - 1) * delay;
      break;

    case "linear":
      // attempt * baseDelay: 1x, 2x, 3x, 4x...
      calculatedDelay = safeAttempt * delay;
      break;

    case "fixed":
      // Always the same delay
      calculatedDelay = delay;
      break;

    default:
      // Fallback to fixed
      calculatedDelay = delay;
  }

  // Apply max cap
  return Math.min(calculatedDelay, maxDelay);
}

/**
 * Add jitter to a delay to prevent thundering herd
 *
 * @param delay - Base delay (milliseconds)
 * @param jitterFactor - Jitter factor (0-1), default 0.1 (10%)
 * @returns Delay with jitter applied (milliseconds)
 *
 * @example
 * ```typescript
 * // Add up to 10% random jitter
 * addJitter(1000, 0.1); // Returns 1000-1100 randomly
 *
 * // Add up to 50% jitter for more spread
 * addJitter(1000, 0.5); // Returns 1000-1500 randomly
 * ```
 */
export function addJitter(delay: number, jitterFactor: number = 0.1): number {
  const jitter = delay * jitterFactor * Math.random();
  return Math.floor(delay + jitter);
}

/**
 * Calculate backoff with jitter
 *
 * Combines calculateBackoff with addJitter for production use.
 *
 * @param attempt - The current attempt number (1-based)
 * @param strategy - The backoff strategy to use
 * @param jitterFactor - Jitter factor (0-1), default 0.1
 * @returns Delay in milliseconds with jitter
 */
export function calculateBackoffWithJitter(
  attempt: number,
  strategy: BackoffStrategy = DEFAULT_BACKOFF,
  jitterFactor: number = 0.1,
): number {
  const baseDelay = calculateBackoff(attempt, strategy);
  return addJitter(baseDelay, jitterFactor);
}

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a random job ID
 *
 * Format: qj_<timestamp>_<random>
 *
 * @returns A unique job ID
 */
export function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `qj_${timestamp}_${random}`;
}

/**
 * Generate a random schedule ID
 *
 * Format: qs_<timestamp>_<random>
 *
 * @returns A unique schedule ID
 */
export function generateScheduleId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `qs_${timestamp}_${random}`;
}

/**
 * Generate a random worker ID
 *
 * Format: wk_<pid>_<timestamp>
 *
 * @returns A unique worker ID
 */
export function createWorkerId(): string {
  // Use process.pid if available (Node.js), otherwise use random
  const pid =
    typeof process !== "undefined" && process.pid
      ? process.pid.toString(36)
      : Math.random().toString(36).substring(2, 6);
  const timestamp = Date.now().toString(36);
  return `wk_${pid}_${timestamp}`;
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * Calculate a future timestamp by adding milliseconds to now
 *
 * @param delay - Delay (milliseconds)
 * @returns Future Date
 */
export function getFutureDate(delay: number): Date {
  return new Date(Date.now() + delay);
}

/**
 * Check if a date is in the past
 *
 * @param date - Date to check
 * @returns true if the date is in the past
 */
export function isInPast(date: Date | null | undefined): boolean {
  if (!date) return false;
  return date.getTime() <= Date.now();
}

/**
 * Check if a date is in the future
 *
 * @param date - Date to check
 * @returns true if the date is in the future
 */
export function isInFuture(date: Date | null | undefined): boolean {
  if (!date) return false;
  return date.getTime() > Date.now();
}

/**
 * Get milliseconds until a future date
 *
 * @param date - Future date
 * @returns Milliseconds until the date, or 0 if in the past
 */
export function getMillisecondsUntil(date: Date): number {
  const diff = date.getTime() - Date.now();
  return Math.max(0, diff);
}

// ============================================================================
// Cron Utilities
// ============================================================================

/**
 * Simple cron expression validator
 *
 * This is a basic validator that checks format, not semantic validity.
 * For production use, consider using a dedicated cron library.
 *
 * @param expression - Cron expression to validate
 * @returns true if the expression is valid format
 */
export function isValidCronExpression(expression: string): boolean {
  // Basic format check: 5 or 6 space-separated parts
  const parts = expression.trim().split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}

// ============================================================================
// Misc Utilities
// ============================================================================

/**
 * Sleep for a specified duration
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms || 0)));
}

/**
 * Sleep for a specified duration with cancellation support
 *
 * This version of sleep can be cancelled via an AbortSignal,
 * which is essential for graceful shutdown scenarios.
 *
 * @param ms - Milliseconds to sleep
 * @param signal - Optional AbortSignal to cancel the sleep
 * @returns Promise that resolves after the delay or when aborted
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 *
 * // Will resolve after 5 seconds or when aborted
 * await cancellableSleep(5000, controller.signal);
 *
 * // To cancel early:
 * controller.abort();
 * ```
 */
export function cancellableSleep(
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    // If already aborted, resolve immediately
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, Math.max(1, ms || 0));

    // Listen for abort signal
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        // oxlint-disable-next-line promise/no-multiple-resolved -- abort clears timeout; at most one fires
        resolve(); // Resolve (not reject) for graceful shutdown
      },
      { once: true },
    );
  });
}

/**
 * Create a deferred promise
 *
 * Useful for creating promises that can be resolved/rejected externally.
 *
 * @returns Object with promise and resolve/reject functions
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 *
 * @param ms - Timeout in milliseconds
 * @param message - Optional error message
 * @returns Promise that rejects after timeout
 */
export function timeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Operation timed out after ${ms}ms`));
    }, ms);
  });
}

/**
 * Race a promise against a timeout
 *
 * @param promise - The promise to race
 * @param ms - Timeout in milliseconds
 * @param message - Optional error message
 * @returns The result of the promise if it completes in time
 * @throws If the timeout is reached first
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message?: string,
): Promise<T> {
  return Promise.race([promise, timeout(ms, message)]);
}

/**
 * Retry a function with backoff
 *
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    backoff?: BackoffStrategy;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const {
    attempts = 3,
    backoff = DEFAULT_BACKOFF,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === attempts || !shouldRetry(error)) {
        throw error;
      }

      const delay = calculateBackoffWithJitter(attempt, backoff);
      await sleep(delay);
    }
  }

  throw lastError;
}
