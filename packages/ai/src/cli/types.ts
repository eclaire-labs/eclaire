/**
 * CLI Provider Types
 *
 * Unified event model and interfaces for CLI-based AI providers
 * (Claude Code, Codex, OpenCode) that communicate via JSONL on stdout.
 */

// =============================================================================
// CLI EVENTS (unified model all decoders produce)
// =============================================================================

export type CliEvent =
  | CliStartedEvent
  | CliContentDeltaEvent
  | CliReasoningDeltaEvent
  | CliActionEvent
  | CliUsageEvent
  | CliErrorEvent
  | CliCompletedEvent;

export interface CliStartedEvent {
  type: "started";
  sessionId?: string;
  meta?: Record<string, unknown>;
}

export interface CliContentDeltaEvent {
  type: "content_delta";
  text: string;
}

export interface CliReasoningDeltaEvent {
  type: "reasoning_delta";
  text: string;
}

export interface CliActionEvent {
  type: "action";
  phase: "started" | "completed";
  name: string;
  ok?: boolean;
  detail?: Record<string, unknown>;
}

export interface CliUsageEvent {
  type: "usage";
  inputTokens?: number;
  outputTokens?: number;
  totalCostUsd?: number;
}

export interface CliErrorEvent {
  type: "error";
  message: string;
}

export interface CliCompletedEvent {
  type: "completed";
  answer: string;
  sessionId?: string;
  ok: boolean;
}

// =============================================================================
// DECODER INTERFACE
// =============================================================================

/**
 * Decodes one line of provider-specific JSONL into unified CliEvents.
 * Implementations should silently skip unknown/malformed lines (return []).
 */
export interface CliJsonlDecoder {
  decodeLine(line: string): CliEvent[];
}

// =============================================================================
// SPAWN CONFIG
// =============================================================================

export interface CliSpawnConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  stdinPayload?: string;
  timeout: number;
  gracefulShutdownMs: number;
}
