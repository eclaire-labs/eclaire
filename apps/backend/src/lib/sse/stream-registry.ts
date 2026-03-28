/**
 * SSE Stream Registry
 *
 * Manages active SSE streams indexed by userId → clientId.
 * Extracted from processing-events route for testability.
 */

export type StreamRef = {
  write: (data: string) => Promise<unknown>;
  readonly closed: boolean;
  abort: () => void;
};

// Map to track active SSE streams by userId → clientId → stream ref
const activeStreams = new Map<string, Map<string, StreamRef>>();

export function registerStream(
  userId: string,
  clientId: string,
  streamRef: StreamRef,
): void {
  if (!activeStreams.has(userId)) {
    activeStreams.set(userId, new Map());
  }
  // biome-ignore lint/style/noNonNullAssertion: map entry set on preceding line
  activeStreams.get(userId)!.set(clientId, streamRef);
}

export function unregisterStream(
  userId: string,
  clientId: string,
  streamRef: StreamRef,
): void {
  const userStreams = activeStreams.get(userId);
  if (!userStreams) return;

  // Only remove if this stream is still the registered one for this clientId
  if (userStreams.get(clientId) === streamRef) {
    userStreams.delete(clientId);
  }
  if (userStreams.size === 0) {
    activeStreams.delete(userId);
  }
}

export function getStreamsForUser(
  userId: string,
): Map<string, StreamRef> | undefined {
  return activeStreams.get(userId);
}

export function removeStreamsByClientIds(
  userId: string,
  clientIds: string[],
): void {
  const userStreams = activeStreams.get(userId);
  if (!userStreams) return;

  for (const clientId of clientIds) {
    userStreams.delete(clientId);
  }
  if (userStreams.size === 0) {
    activeStreams.delete(userId);
  }
}

/** Clear all streams — for testing only. */
export function clearAllStreams(): void {
  activeStreams.clear();
}
