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
