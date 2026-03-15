/**
 * Codex CLI JSONL Decoder
 *
 * Parses the JSON output from `codex exec --json --skip-git-repo-check --color=never -`.
 * Each line is a JSON object with a "type" tag field.
 *
 * Reference: Takopi's schemas/codex.py and runners/codex.py
 */

import type { CliEvent, CliJsonlDecoder } from "../types.js";

// =============================================================================
// CODEX JSONL TYPES
// =============================================================================

interface CodexUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  output_tokens: number;
}

interface CodexThreadStarted {
  type: "thread.started";
  thread_id: string;
}

interface CodexTurnStarted {
  type: "turn.started";
}

interface CodexTurnCompleted {
  type: "turn.completed";
  usage: CodexUsage;
}

interface CodexTurnFailed {
  type: "turn.failed";
  error: { message: string };
}

interface CodexStreamError {
  type: "error";
  message: string;
}

interface CodexAgentMessageItem {
  type: "agent_message";
  id: string;
  text: string;
  phase?: string;
}

interface CodexReasoningItem {
  type: "reasoning";
  id: string;
  text: string;
}

interface CodexCommandExecutionItem {
  type: "command_execution";
  id: string;
  command: string;
  aggregated_output: string;
  exit_code: number | null;
  status: string;
}

interface CodexFileChangeItem {
  type: "file_change";
  id: string;
  changes: Array<{ path: string; kind: string }>;
  status: string;
}

interface CodexMcpToolCallItem {
  type: "mcp_tool_call";
  id: string;
  server: string;
  tool: string;
  arguments: unknown;
  status: string;
}

type CodexThreadItem =
  | CodexAgentMessageItem
  | CodexReasoningItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | CodexMcpToolCallItem
  | { type: string; id?: string; [key: string]: unknown };

interface CodexItemEvent {
  type: "item.started" | "item.updated" | "item.completed";
  item: CodexThreadItem;
}

type CodexEvent =
  | CodexThreadStarted
  | CodexTurnStarted
  | CodexTurnCompleted
  | CodexTurnFailed
  | CodexStreamError
  | CodexItemEvent
  | { type: string; [key: string]: unknown };

// =============================================================================
// DECODER
// =============================================================================

export class CodexCliDecoder implements CliJsonlDecoder {
  private finalAnswer: string | null = null;
  private hasEmittedContentDeltas = false;

  decodeLine(line: string): CliEvent[] {
    let parsed: CodexEvent;
    try {
      parsed = JSON.parse(line) as CodexEvent;
    } catch {
      return [];
    }

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return [];
    }

    switch (parsed.type) {
      case "thread.started":
        return this.handleThreadStarted(parsed as CodexThreadStarted);
      case "turn.started":
        return [];
      case "turn.completed":
        return this.handleTurnCompleted(parsed as CodexTurnCompleted);
      case "turn.failed":
        return this.handleTurnFailed(parsed as CodexTurnFailed);
      case "error":
        return [
          { type: "error", message: (parsed as CodexStreamError).message },
        ];
      case "item.started":
      case "item.updated":
      case "item.completed":
        return this.handleItemEvent(parsed as CodexItemEvent);
      default:
        return [];
    }
  }

  private handleThreadStarted(event: CodexThreadStarted): CliEvent[] {
    return [
      {
        type: "started",
        sessionId: event.thread_id,
      },
    ];
  }

  private handleTurnCompleted(event: CodexTurnCompleted): CliEvent[] {
    const events: CliEvent[] = [];

    if (event.usage) {
      events.push({
        type: "usage",
        inputTokens: event.usage.input_tokens,
        outputTokens: event.usage.output_tokens,
      });
    }

    events.push({
      type: "completed",
      answer: this.hasEmittedContentDeltas ? "" : (this.finalAnswer ?? ""),
      sessionId: undefined,
      ok: true,
    });

    return events;
  }

  private handleTurnFailed(event: CodexTurnFailed): CliEvent[] {
    return [
      {
        type: "completed",
        answer: this.finalAnswer ?? "",
        ok: false,
      },
      {
        type: "error",
        message: event.error.message,
      },
    ];
  }

  private handleItemEvent(event: CodexItemEvent): CliEvent[] {
    const phase = event.type.split(".")[1] as
      | "started"
      | "updated"
      | "completed";
    const item = event.item;

    switch (item.type) {
      case "agent_message": {
        const msg = item as CodexAgentMessageItem;
        if (phase === "completed" && msg.text) {
          this.finalAnswer = msg.text;
          this.hasEmittedContentDeltas = true;
          return [{ type: "content_delta", text: msg.text }];
        }
        return [];
      }

      case "reasoning": {
        const reasoning = item as CodexReasoningItem;
        if (reasoning.text) {
          return [{ type: "reasoning_delta", text: reasoning.text }];
        }
        return [];
      }

      case "command_execution": {
        const cmd = item as CodexCommandExecutionItem;
        return [
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
        ];
      }

      case "file_change": {
        const fc = item as CodexFileChangeItem;
        if (phase !== "completed") return [];
        const paths = fc.changes.map((c) => `${c.kind}: ${c.path}`).join(", ");
        return [
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
        ];
      }

      case "mcp_tool_call": {
        const mcp = item as CodexMcpToolCallItem;
        return [
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
        ];
      }

      default:
        return [];
    }
  }
}
