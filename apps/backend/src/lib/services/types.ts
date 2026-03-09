import type { HistoryActor } from "./history.js";

/**
 * Identifies who is performing a service operation.
 * Used for audit history attribution — every mutating service call
 * must specify the caller so history records the correct actor.
 */
export interface CallerContext {
  userId: string;
  actor: HistoryActor;
}

/** Create a CallerContext for a human user. */
export function userCaller(userId: string): CallerContext {
  return { userId, actor: "user" };
}

/** Create a CallerContext for an AI assistant. */
export function assistantCaller(userId: string): CallerContext {
  return { userId, actor: "assistant" };
}

/** Create a CallerContext for a system/worker process. */
export function systemCaller(userId: string): CallerContext {
  return { userId, actor: "system" };
}
