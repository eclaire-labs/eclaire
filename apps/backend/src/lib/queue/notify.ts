/**
 * Shared in-memory notify pair for single-process deployments
 *
 * This module creates a shared emitter/listener pair that allows:
 * - The queue adapter (enqueue side) to emit notifications
 * - The workers (consume side) to subscribe and wake up instantly
 *
 * For multi-process deployments, use Postgres NOTIFY instead.
 */

import { createInMemoryNotify, type NotifyEmitter, type NotifyListener } from "@eclaire/queue/driver-db";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("queue-notify");

// Singleton notify pair - shared across adapter and workers
let notifyPair: { emitter: NotifyEmitter; listener: NotifyListener } | null = null;

/**
 * Get or create the shared notify pair
 *
 * This is safe to call multiple times - it returns the same instance.
 */
export function getNotifyPair(): { emitter: NotifyEmitter; listener: NotifyListener } {
  if (!notifyPair) {
    notifyPair = createInMemoryNotify({ logger });
    logger.info({}, "Created in-memory notify pair for instant worker wakeup");
  }
  return notifyPair;
}

/**
 * Get just the emitter (for the adapter/enqueue side)
 */
export function getNotifyEmitter(): NotifyEmitter {
  return getNotifyPair().emitter;
}

/**
 * Get just the listener (for the worker/consume side)
 */
export function getNotifyListener(): NotifyListener {
  return getNotifyPair().listener;
}

/**
 * Close the notify pair (for graceful shutdown)
 */
export async function closeNotifyPair(): Promise<void> {
  if (notifyPair) {
    await notifyPair.emitter.close();
    await notifyPair.listener.close();
    notifyPair = null;
    logger.info({}, "Closed in-memory notify pair");
  }
}
