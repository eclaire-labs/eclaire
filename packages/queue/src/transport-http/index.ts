/**
 * @eclaire/queue/transport-http - HTTP transport layer for remote workers
 *
 * This module provides HTTP-based job processing for scenarios where
 * workers cannot directly access the database. It includes:
 * - HTTP client for making requests to the backend
 * - HTTP poller (worker) that uses long-polling
 *
 * The server-side routes are expected to be implemented by the application
 * (e.g., using the existing /api/jobs routes in Eclaire).
 *
 * @example Remote worker using HTTP transport
 * ```typescript
 * import { createHttpWorker } from '@eclaire/queue/transport-http';
 *
 * // Create worker that connects to backend via HTTP
 * const worker = createHttpWorker('bookmark-processing', async (ctx) => {
 *   const { bookmarkId, url } = ctx.job.data;
 *
 *   // Process the bookmark...
 *   ctx.log(`Processing bookmark ${bookmarkId}`);
 *
 *   // Call heartbeat for long-running tasks
 *   await ctx.heartbeat();
 *
 *   // If rate limited, throw RateLimitError
 *   if (isRateLimited) {
 *     throw new RateLimitError(10000); // Retry after 10 seconds
 *   }
 * }, {
 *   backendUrl: 'http://localhost:3000',
 *   logger,
 * });
 *
 * await worker.start();
 * ```
 *
 * @example Using worker factory
 * ```typescript
 * import { createHttpWorkerFactory } from '@eclaire/queue/transport-http';
 *
 * const createWorker = createHttpWorkerFactory({
 *   backendUrl: process.env.BACKEND_URL,
 *   logger,
 * });
 *
 * // Create multiple workers with same config
 * const bookmarkWorker = createWorker('bookmark-processing', handleBookmark);
 * const imageWorker = createWorker('image-processing', handleImage);
 *
 * await Promise.all([
 *   bookmarkWorker.start(),
 *   imageWorker.start(),
 * ]);
 * ```
 */

// Type exports
export type {
  HttpServerConfig,
  HttpRoutesHandler,
  HttpJobResponse,
  HttpStatsResponse,
  HttpClientConfig,
  HttpPollerConfig,
} from "./types.js";

// Client exports
export {
  createHttpClient,
  type HttpQueueClient,
} from "./client.js";

// Poller exports
export {
  createHttpWorker,
  createHttpWorkerFactory,
  type HttpWorkerFactory,
} from "./poller.js";
