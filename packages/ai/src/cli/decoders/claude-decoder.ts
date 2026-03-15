/**
 * Claude Code CLI JSONL Decoder
 *
 * Parses the `stream-json` output format from `claude -p --output-format stream-json`.
 * Each line is a JSON object with a "type" field.
 *
 * Reference: Takopi's schemas/claude.py
 */

import type { CliEvent, CliJsonlDecoder } from "../types.js";

// =============================================================================
// CLAUDE JSONL TYPES (subset of what the CLI emits)
// =============================================================================

interface ClaudeStreamSystem {
  type: "system";
  subtype: string;
  session_id?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
  permissionMode?: string;
}

interface ClaudeTextBlock {
  type: "text";
  text: string;
}

interface ClaudeThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

interface ClaudeToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ClaudeToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content?: string | unknown[];
  is_error?: boolean;
}

type ClaudeContentBlock =
  | ClaudeTextBlock
  | ClaudeThinkingBlock
  | ClaudeToolUseBlock
  | ClaudeToolResultBlock;

interface ClaudeStreamAssistant {
  type: "assistant";
  message: {
    role: "assistant";
    content: ClaudeContentBlock[];
    model?: string;
    error?: string;
  };
  parent_tool_use_id?: string;
  session_id?: string;
}

interface ClaudeStreamUser {
  type: "user";
  message: {
    role: "user";
    content: string | ClaudeContentBlock[];
  };
  session_id?: string;
}

interface ClaudeStreamResult {
  type: "result";
  subtype: string;
  session_id: string;
  result?: string;
  is_error: boolean;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

type ClaudeStreamEvent =
  | ClaudeStreamSystem
  | ClaudeStreamAssistant
  | ClaudeStreamUser
  | ClaudeStreamResult
  | { type: string; [key: string]: unknown }; // catch-all for unknown events

// =============================================================================
// DECODER
// =============================================================================

export class ClaudeCliDecoder implements CliJsonlDecoder {
  /** Track the last assistant text for completed event fallback */
  private lastAssistantText: string | null = null;
  /** Track whether we've already emitted content deltas (to avoid duplication in completed) */
  private hasEmittedContentDeltas = false;

  decodeLine(line: string): CliEvent[] {
    let parsed: ClaudeStreamEvent;
    try {
      parsed = JSON.parse(line) as ClaudeStreamEvent;
    } catch {
      return [];
    }

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return [];
    }

    switch (parsed.type) {
      case "system":
        return this.handleSystem(parsed as ClaudeStreamSystem);
      case "assistant":
        return this.handleAssistant(parsed as ClaudeStreamAssistant);
      case "user":
        return this.handleUser(parsed as ClaudeStreamUser);
      case "result":
        return this.handleResult(parsed as ClaudeStreamResult);
      default:
        // Skip unknown event types (stream_event, control_request, etc.)
        return [];
    }
  }

  private handleSystem(event: ClaudeStreamSystem): CliEvent[] {
    if (event.subtype !== "init") return [];
    if (!event.session_id) return [];

    const meta: Record<string, unknown> = {};
    if (event.model) meta.model = event.model;
    if (event.cwd) meta.cwd = event.cwd;
    if (event.tools) meta.tools = event.tools;
    if (event.permissionMode) meta.permissionMode = event.permissionMode;

    return [
      {
        type: "started",
        sessionId: event.session_id,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      },
    ];
  }

  private handleAssistant(event: ClaudeStreamAssistant): CliEvent[] {
    const events: CliEvent[] = [];

    for (const block of event.message.content) {
      switch (block.type) {
        case "text":
          if (block.text) {
            this.lastAssistantText = block.text;
            this.hasEmittedContentDeltas = true;
            events.push({ type: "content_delta", text: block.text });
          }
          break;

        case "thinking":
          if (block.thinking) {
            events.push({ type: "reasoning_delta", text: block.thinking });
          }
          break;

        case "tool_use":
          events.push({
            type: "action",
            phase: "started",
            name: block.name,
            detail: {
              id: block.id,
              input: block.input,
              parent_tool_use_id: event.parent_tool_use_id,
            },
          });
          break;
      }
    }

    return events;
  }

  private handleUser(event: ClaudeStreamUser): CliEvent[] {
    const events: CliEvent[] = [];
    const content = event.message.content;

    if (!Array.isArray(content)) return [];

    for (const block of content) {
      if (
        typeof block === "object" &&
        "type" in block &&
        block.type === "tool_result"
      ) {
        const toolResult = block as ClaudeToolResultBlock;
        events.push({
          type: "action",
          phase: "completed",
          name: "tool_result",
          ok: !toolResult.is_error,
          detail: {
            tool_use_id: toolResult.tool_use_id,
            is_error: toolResult.is_error,
          },
        });
      }
    }

    return events;
  }

  private handleResult(event: ClaudeStreamResult): CliEvent[] {
    const events: CliEvent[] = [];

    // Emit usage event if available
    if (event.usage || event.total_cost_usd != null) {
      events.push({
        type: "usage",
        inputTokens: event.usage?.input_tokens,
        outputTokens: event.usage?.output_tokens,
        totalCostUsd: event.total_cost_usd ?? undefined,
      });
    }

    // Emit completed event
    const ok = !event.is_error;
    let answer = event.result ?? "";
    // If we already streamed content deltas, don't duplicate the answer
    if (this.hasEmittedContentDeltas) {
      answer = "";
    } else if (!answer && this.lastAssistantText) {
      answer = this.lastAssistantText;
    }

    events.push({
      type: "completed",
      answer,
      sessionId: event.session_id,
      ok,
    });

    return events;
  }
}
