/**
 * WebSocket Infrastructure
 *
 * Lazy-init pattern for @hono/node-ws. Must be initialized with the Hono app
 * before any WebSocket routes can use `upgradeWebSocket`.
 */

import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";

type NodeWebSocketResult = ReturnType<typeof createNodeWebSocket>;

let wsResult: NodeWebSocketResult | null = null;

/**
 * Initialize WebSocket support. Call once after creating the Hono app,
 * before registering routes.
 */
export function initWebSocket(app: Hono): void {
  wsResult = createNodeWebSocket({ app });
}

/**
 * Get the `upgradeWebSocket` middleware for use in route definitions.
 */
export function getUpgradeWebSocket(): NodeWebSocketResult["upgradeWebSocket"] {
  if (!wsResult) {
    throw new Error(
      "WebSocket not initialized — call initWebSocket(app) first",
    );
  }
  return wsResult.upgradeWebSocket;
}

/**
 * Get the `injectWebSocket` function to call after `serve()`.
 */
export function getInjectWebSocket(): NodeWebSocketResult["injectWebSocket"] {
  if (!wsResult) {
    throw new Error(
      "WebSocket not initialized — call initWebSocket(app) first",
    );
  }
  return wsResult.injectWebSocket;
}
