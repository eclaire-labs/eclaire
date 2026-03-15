/**
 * Dialect Adapter Registry
 *
 * Exports all dialect adapters and provides a registry for looking up
 * adapters by dialect type.
 */

import type { Dialect } from "../types.js";
import { anthropicMessagesAdapter } from "./anthropic-messages.js";
import { mlxNativeAdapter } from "./mlx-native.js";
import { openaiCompatibleAdapter } from "./openai-compatible.js";
import type { AdapterRegistry, DialectAdapter } from "./types.js";

// =============================================================================
// ADAPTER REGISTRY
// =============================================================================

/**
 * Registry of all available dialect adapters
 */
export const adapterRegistry: AdapterRegistry = {
  openai_compatible: openaiCompatibleAdapter,
  mlx_native: mlxNativeAdapter,
  anthropic_messages: anthropicMessagesAdapter,
};

/**
 * Get adapter for a specific dialect.
 * CLI dialects use a separate transport path and don't have a DialectAdapter.
 */
export function getAdapter(dialect: Dialect): DialectAdapter {
  if (dialect === "cli_jsonl") {
    throw new Error(
      "cli_jsonl dialect uses subprocess transport, not HTTP adapters. " +
        "This is handled by the CLI client (cli/client-cli.ts).",
    );
  }
  const adapter = adapterRegistry[dialect];
  if (!adapter) {
    throw new Error(`No adapter found for dialect: ${dialect}`);
  }
  return adapter;
}

/**
 * Check if a dialect is supported
 */
export function isDialectSupported(dialect: string): dialect is Dialect {
  return dialect in adapterRegistry || dialect === "cli_jsonl";
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { anthropicMessagesAdapter } from "./anthropic-messages.js";
export { mlxNativeAdapter } from "./mlx-native.js";
export { openaiCompatibleAdapter } from "./openai-compatible.js";
export type { AdapterRegistry, DialectAdapter } from "./types.js";
