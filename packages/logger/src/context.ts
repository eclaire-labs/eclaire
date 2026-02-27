import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request context stored in AsyncLocalStorage
 * Automatically propagated through async operations
 */
export interface RequestContext {
  requestId: string;
  [key: string]: unknown;
}

/**
 * Singleton AsyncLocalStorage instance for request context
 */
export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current requestId from AsyncLocalStorage context
 * Returns undefined if not within a request context
 */
export function getRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

/**
 * Run a function within a request context
 * All async operations within fn will have access to the requestId
 */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return asyncLocalStorage.run({ requestId }, fn);
}

/**
 * Get the full request context from AsyncLocalStorage
 * Returns undefined if not within a request context
 */
export function getContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Run a function within a full request context
 * All async operations within fn will have access to the context
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}
