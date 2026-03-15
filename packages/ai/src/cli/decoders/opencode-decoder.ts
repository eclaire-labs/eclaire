/**
 * OpenCode CLI JSONL Decoder
 *
 * Parses the JSON output from `opencode run --format json -- "prompt"`.
 * Each line is a JSON object with a "type" field.
 *
 * Event types: step_start, step_finish, tool_use, text, error
 * Session IDs use format: ses_XXXX
 *
 * Reference: Takopi's schemas/opencode.py and runners/opencode.py
 */

import type { CliEvent, CliJsonlDecoder } from "../types.js";

// =============================================================================
// OPENCODE JSONL TYPES
// =============================================================================

interface OpenCodeStepStart {
  type: "step_start";
  timestamp?: number;
  sessionID?: string;
  part?: Record<string, unknown>;
}

interface OpenCodeStepFinish {
  type: "step_finish";
  timestamp?: number;
  sessionID?: string;
  part?: {
    reason?: string;
    [key: string]: unknown;
  };
}

interface OpenCodeToolUse {
  type: "tool_use";
  timestamp?: number;
  sessionID?: string;
  part?: {
    callID?: string;
    id?: string;
    tool?: string;
    state?: {
      status?: string;
      input?: Record<string, unknown>;
      output?: unknown;
      title?: string;
      error?: unknown;
      metadata?: { exit?: number; [key: string]: unknown };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

interface OpenCodeText {
  type: "text";
  timestamp?: number;
  sessionID?: string;
  part?: {
    text?: string;
    [key: string]: unknown;
  };
}

interface OpenCodeError {
  type: "error";
  timestamp?: number;
  sessionID?: string;
  error?: unknown;
  message?: unknown;
}

type OpenCodeEvent =
  | OpenCodeStepStart
  | OpenCodeStepFinish
  | OpenCodeToolUse
  | OpenCodeText
  | OpenCodeError
  | { type: string; [key: string]: unknown };

// =============================================================================
// DECODER
// =============================================================================

export class OpenCodeCliDecoder implements CliJsonlDecoder {
  private sessionId: string | null = null;
  private lastText: string | null = null;
  private emittedStarted = false;
  private hasEmittedContentDeltas = false;

  decodeLine(line: string): CliEvent[] {
    let parsed: OpenCodeEvent;
    try {
      parsed = JSON.parse(line) as OpenCodeEvent;
    } catch {
      return [];
    }

    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) {
      return [];
    }

    // Capture session ID from any event
    const sessionID = (parsed as { sessionID?: string }).sessionID;
    if (typeof sessionID === "string" && sessionID && !this.sessionId) {
      this.sessionId = sessionID;
    }

    switch (parsed.type) {
      case "step_start":
        return this.handleStepStart();
      case "step_finish":
        return this.handleStepFinish(parsed as OpenCodeStepFinish);
      case "tool_use":
        return this.handleToolUse(parsed as OpenCodeToolUse);
      case "text":
        return this.handleText(parsed as OpenCodeText);
      case "error":
        return this.handleError(parsed as OpenCodeError);
      default:
        return [];
    }
  }

  private handleStepStart(): CliEvent[] {
    if (!this.emittedStarted && this.sessionId) {
      this.emittedStarted = true;
      return [
        {
          type: "started",
          sessionId: this.sessionId,
        },
      ];
    }
    return [];
  }

  private handleStepFinish(event: OpenCodeStepFinish): CliEvent[] {
    const reason = event.part?.reason;

    if (reason === "stop") {
      return [
        {
          type: "completed",
          answer: this.hasEmittedContentDeltas ? "" : (this.lastText ?? ""),
          sessionId: this.sessionId ?? undefined,
          ok: true,
        },
      ];
    }

    return [];
  }

  private handleToolUse(event: OpenCodeToolUse): CliEvent[] {
    const part = event.part ?? {};
    const state = part.state ?? {};
    const status = state.status as string | undefined;
    const callId = (part.callID ?? part.id) as string | undefined;
    const toolName = (part.tool ?? "tool") as string;

    if (!callId) return [];

    if (status === "completed") {
      return [
        {
          type: "action",
          phase: "completed",
          name: toolName,
          ok: true,
          detail: { callID: callId },
        },
      ];
    }

    if (status === "error") {
      return [
        {
          type: "action",
          phase: "completed",
          name: toolName,
          ok: false,
          detail: {
            callID: callId,
            error: state.error,
          },
        },
      ];
    }

    // In-progress or initial
    return [
      {
        type: "action",
        phase: "started",
        name: toolName,
        detail: {
          callID: callId,
          input: state.input,
        },
      },
    ];
  }

  private handleText(event: OpenCodeText): CliEvent[] {
    const text = event.part?.text;
    if (typeof text === "string" && text) {
      this.lastText = this.lastText ? this.lastText + text : text;
      this.hasEmittedContentDeltas = true;
      return [{ type: "content_delta", text }];
    }
    return [];
  }

  private handleError(event: OpenCodeError): CliEvent[] {
    let message: string;

    const raw = event.message ?? event.error;
    if (typeof raw === "string") {
      message = raw;
    } else if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      const data = obj.data as Record<string, unknown> | undefined;
      message =
        (data?.message as string) ??
        (obj.message as string) ??
        (obj.name as string) ??
        "opencode error";
    } else {
      message = "opencode error";
    }

    return [
      {
        type: "error",
        message: String(message),
      },
      {
        type: "completed",
        answer: this.lastText ?? "",
        sessionId: this.sessionId ?? undefined,
        ok: false,
      },
    ];
  }
}
