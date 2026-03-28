/**
 * Queue management stubs
 *
 * Queue operations go through the QueueAdapter.
 */

import type { QueueName } from "./queue-names.js";

export function getQueue(_name: QueueName): null {
  return null;
}

export async function closeQueues(): Promise<void> {
  // No-op: database queue cleanup is handled by the adapter
}
