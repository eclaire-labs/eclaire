/**
 * Codex CLI JSONL Decoder
 *
 * Parses the JSON output from `codex exec --json --skip-git-repo-check --color=never -`.
 * Each line is a JSON object with a "type" tag field.
 *
 * Reference: Takopi's schemas/codex.py and runners/codex.py
 */

import type { CliEvent, CliJsonlDecoder } from "../types.js";
import {
  type CodexItemPhase,
  type CodexThreadItem,
  type CodexUsage,
  decodeCodexItem,
} from "./codex-items.js";

// =============================================================================
// CODEX JSONL EVENT TYPES (exec-specific envelope)
// =============================================================================

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
    const phase = event.type.split(".")[1] as CodexItemPhase;
    const result = decodeCodexItem(event.item, phase);

    if (result.agentMessageText) {
      this.finalAnswer = result.agentMessageText;
      this.hasEmittedContentDeltas = true;
    }

    return result.events;
  }
}
