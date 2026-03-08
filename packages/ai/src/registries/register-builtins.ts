/**
 * Register Built-in Providers
 *
 * Registers the three existing dialect adapters into the dynamic provider registry.
 * Call this at initialization time to seed the registry with the built-in providers.
 */

import { anthropicMessagesAdapter } from "../adapters/anthropic-messages.js";
import { mlxNativeAdapter } from "../adapters/mlx-native.js";
import { openaiCompatibleAdapter } from "../adapters/openai-compatible.js";
import { registerProvider } from "./provider-registry.js";

let registered = false;

/**
 * Register all built-in providers.
 * Safe to call multiple times — only registers once.
 */
export function registerBuiltinProviders(): void {
  if (registered) return;

  registerProvider("openai-compatible", {
    adapter: openaiCompatibleAdapter,
  });

  registerProvider("anthropic-messages", {
    adapter: anthropicMessagesAdapter,
  });

  registerProvider("mlx-native", {
    adapter: mlxNativeAdapter,
  });

  registered = true;
}

/**
 * Reset the registration flag (for testing).
 */
export function resetBuiltinRegistration(): void {
  registered = false;
}
