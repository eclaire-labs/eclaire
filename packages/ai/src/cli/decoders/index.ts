/**
 * CLI Decoder Registry
 *
 * Maps CLI provider names to their JSONL decoder implementations.
 */

import type { CliJsonlDecoder } from "../types.js";
import { ClaudeCliDecoder } from "./claude-decoder.js";
import { CodexCliDecoder } from "./codex-decoder.js";
import { OpenCodeCliDecoder } from "./opencode-decoder.js";

/**
 * Get a decoder instance for a CLI provider.
 * Each call returns a fresh decoder (decoders are stateful).
 */
export function createDecoder(cliProvider: string): CliJsonlDecoder {
  switch (cliProvider) {
    case "claude":
      return new ClaudeCliDecoder();
    case "codex":
      return new CodexCliDecoder();
    case "opencode":
      return new OpenCodeCliDecoder();
    default:
      throw new Error(
        `Unknown CLI provider: "${cliProvider}". Supported: claude, codex, opencode`,
      );
  }
}

export { ClaudeCliDecoder } from "./claude-decoder.js";
export { CodexCliDecoder } from "./codex-decoder.js";
export { OpenCodeCliDecoder } from "./opencode-decoder.js";
