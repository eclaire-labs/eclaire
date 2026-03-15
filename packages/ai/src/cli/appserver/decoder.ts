/**
 * Codex App-Server Notification Decoder
 *
 * Converts app-server JSON-RPC notification method+params into unified CliEvents.
 * Reuses shared Codex item decoding logic from codex-items.ts.
 */

import type { CliEvent } from "../types.js";
import {
  type CodexThreadItem,
  decodeCodexItem,
} from "../decoders/codex-items.js";
import type {
  AppServerItem,
  ItemCompletedParams,
  ItemDeltaParams,
  ItemStartedParams,
  TurnCompletedParams,
  TurnFailedParams,
} from "./types.js";

// =============================================================================
// ITEM CONVERSION
// =============================================================================

/**
 * Convert an AppServerItem to a CodexThreadItem for shared decoding.
 */
function toCodexThreadItem(item: AppServerItem): CodexThreadItem {
  return item as unknown as CodexThreadItem;
}

// =============================================================================
// NOTIFICATION DECODER
// =============================================================================

/**
 * Decode a single app-server JSON-RPC notification into CliEvents.
 *
 * The app-server uses `/` separators in method names (e.g., `item/started`)
 * while codex exec uses `.` separators (e.g., `item.started`).
 * The item shapes are the same.
 */
export function decodeAppServerNotification(
  method: string,
  params: Record<string, unknown>,
): CliEvent[] {
  switch (method) {
    // =========================================================================
    // ITEM EVENTS
    // =========================================================================

    case "item/started": {
      const p = params as unknown as ItemStartedParams;
      if (!p.item) return [];
      return decodeCodexItem(toCodexThreadItem(p.item), "started").events;
    }

    case "item/completed": {
      const p = params as unknown as ItemCompletedParams;
      if (!p.item) return [];
      return decodeCodexItem(toCodexThreadItem(p.item), "completed").events;
    }

    // =========================================================================
    // DELTA EVENTS (streaming text from agent)
    // =========================================================================

    case "item/agentMessage/delta": {
      const p = params as unknown as ItemDeltaParams;
      if (!p.delta) return [];
      return [{ type: "content_delta", text: p.delta }];
    }

    case "item/reasoning/delta": {
      const p = params as unknown as ItemDeltaParams;
      if (!p.delta) return [];
      return [{ type: "reasoning_delta", text: p.delta }];
    }

    // =========================================================================
    // TURN EVENTS
    // =========================================================================

    case "turn/completed": {
      const p = params as unknown as TurnCompletedParams;
      const events: CliEvent[] = [];

      if (p.usage) {
        events.push({
          type: "usage",
          inputTokens: p.usage.input_tokens,
          outputTokens: p.usage.output_tokens,
        });
      }

      events.push({
        type: "completed",
        answer: "",
        sessionId: p.threadId,
        ok: true,
      });

      return events;
    }

    case "turn/failed": {
      const p = params as unknown as TurnFailedParams;
      return [
        {
          type: "completed",
          answer: "",
          sessionId: p.threadId,
          ok: false,
        },
        {
          type: "error",
          message: p.error?.message ?? "Turn failed",
        },
      ];
    }

    // =========================================================================
    // UNKNOWN — silently skip
    // =========================================================================

    default:
      return [];
  }
}
