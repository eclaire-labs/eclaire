/**
 * CLI Provider Module
 *
 * Provides support for CLI-based AI providers (Claude Code, Codex, OpenCode)
 * that communicate via JSONL on stdout.
 */

// Client functions
export { callAICli, callAICliStream } from "./client-cli.js";
// Decoders
export {
  ClaudeCliDecoder,
  CodexCliDecoder,
  createDecoder,
  OpenCodeCliDecoder,
} from "./decoders/index.js";
// Subprocess runner
export { CliSubprocessRunner } from "./subprocess-runner.js";

// Types
export type {
  CliActionEvent,
  CliCompletedEvent,
  CliContentDeltaEvent,
  CliErrorEvent,
  CliEvent,
  CliJsonlDecoder,
  CliReasoningDeltaEvent,
  CliSpawnConfig,
  CliStartedEvent,
  CliUsageEvent,
} from "./types.js";
