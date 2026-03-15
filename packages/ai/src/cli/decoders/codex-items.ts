/**
 * Shared Codex Item Types & Decoder
 *
 * Reusable Codex thread-item types and decoding logic shared between
 * the one-shot `codex exec` decoder and the `codex app-server` decoder.
 */

import type { CliEvent } from "../types.js";

// =============================================================================
// CODEX ITEM TYPES
// =============================================================================

export interface CodexUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  output_tokens: number;
}

export interface CodexAgentMessageItem {
  type: "agent_message";
  id: string;
  text: string;
  phase?: string;
}

export interface CodexReasoningItem {
  type: "reasoning";
  id: string;
  text: string;
}

export interface CodexCommandExecutionItem {
  type: "command_execution";
  id: string;
  command: string;
  aggregated_output: string;
  exit_code: number | null;
  status: string;
}

export interface CodexFileChangeItem {
  type: "file_change";
  id: string;
  changes: Array<{ path: string; kind: string }>;
  status: string;
}

export interface CodexMcpToolCallItem {
  type: "mcp_tool_call";
  id: string;
  server: string;
  tool: string;
  arguments: unknown;
  status: string;
}

export type CodexThreadItem =
  | CodexAgentMessageItem
  | CodexReasoningItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | CodexMcpToolCallItem
  | { type: string; id?: string; [key: string]: unknown };

// =============================================================================
// ITEM PHASE TYPE
// =============================================================================

export type CodexItemPhase = "started" | "updated" | "completed";

// =============================================================================
// SHARED ITEM DECODER
// =============================================================================

export interface DecodeItemResult {
  events: CliEvent[];
  /** If an agent_message was completed, this is the final answer text */
  agentMessageText?: string;
}

/**
 * Decode a single Codex thread item into CliEvents.
 * Shared between `codex exec` and `codex app-server` decoders.
 */
export function decodeCodexItem(
  item: CodexThreadItem,
  phase: CodexItemPhase,
): DecodeItemResult {
  switch (item.type) {
    case "agent_message": {
      const msg = item as CodexAgentMessageItem;
      if (phase === "completed" && msg.text) {
        return {
          events: [{ type: "content_delta", text: msg.text }],
          agentMessageText: msg.text,
        };
      }
      return { events: [] };
    }

    case "reasoning": {
      const reasoning = item as CodexReasoningItem;
      if (reasoning.text) {
        return {
          events: [{ type: "reasoning_delta", text: reasoning.text }],
        };
      }
      return { events: [] };
    }

    case "command_execution": {
      const cmd = item as CodexCommandExecutionItem;
      return {
        events: [
          {
            type: "action",
            phase: phase === "updated" ? "started" : phase,
            name: cmd.command || "command",
            ok: phase === "completed" ? cmd.status === "completed" : undefined,
            detail: {
              id: cmd.id,
              command: cmd.command,
              exit_code: cmd.exit_code,
              status: cmd.status,
            },
          },
        ],
      };
    }

    case "file_change": {
      const fc = item as CodexFileChangeItem;
      if (phase !== "completed") return { events: [] };
      const paths = fc.changes.map((c) => `${c.kind}: ${c.path}`).join(", ");
      return {
        events: [
          {
            type: "action",
            phase: "completed",
            name: `file_change: ${paths}`,
            ok: fc.status === "completed",
            detail: {
              id: fc.id,
              changes: fc.changes,
              status: fc.status,
            },
          },
        ],
      };
    }

    case "mcp_tool_call": {
      const mcp = item as CodexMcpToolCallItem;
      return {
        events: [
          {
            type: "action",
            phase: phase === "updated" ? "started" : phase,
            name: `${mcp.server}/${mcp.tool}`,
            ok: phase === "completed" ? mcp.status === "completed" : undefined,
            detail: {
              id: mcp.id,
              server: mcp.server,
              tool: mcp.tool,
              status: mcp.status,
            },
          },
        ],
      };
    }

    default:
      return { events: [] };
  }
}
