/**
 * Provider Registry
 *
 * Dynamic registry for AI providers, replacing the static adapter registry.
 * Existing adapters register themselves at init time; new providers can be
 * added at runtime.
 */

import type { DialectAdapter } from "../adapters/types.js";
import type { Dialect, ProviderConfig } from "../types.js";

// =============================================================================
// TYPES
// =============================================================================

/** Registration entry for a provider */
export interface ProviderRegistration {
  /** Provider name (e.g., "openai", "anthropic", "ollama") */
  name: string;
  /** Dialect adapter for request/response transformation */
  adapter: DialectAdapter;
  /** Optional default config (can be overridden per-model) */
  defaultConfig?: Partial<ProviderConfig>;
}

// =============================================================================
// REGISTRY
// =============================================================================

const providers = new Map<string, ProviderRegistration>();

/**
 * Register a provider by name.
 * If a provider with the same name already exists, it is replaced.
 */
export function registerProvider(
  name: string,
  registration: Omit<ProviderRegistration, "name">,
): void {
  providers.set(name, { name, ...registration });
}

/**
 * Get a registered provider by name.
 */
export function getProvider(name: string): ProviderRegistration | undefined {
  return providers.get(name);
}

/**
 * Get a dialect adapter by dialect type.
 * This is a compatibility bridge — the old code uses dialect-based lookup,
 * while the new registry uses name-based lookup.
 */
export function getAdapterByDialect(
  dialect: Dialect,
): DialectAdapter | undefined {
  for (const registration of providers.values()) {
    if (registration.adapter.dialect === dialect) {
      return registration.adapter;
    }
  }
  return undefined;
}

/**
 * List all registered provider names.
 */
export function listProviders(): string[] {
  return Array.from(providers.keys());
}

/**
 * Remove a registered provider.
 */
export function unregisterProvider(name: string): boolean {
  return providers.delete(name);
}

/**
 * Check if a provider is registered.
 */
export function hasProvider(name: string): boolean {
  return providers.has(name);
}

/**
 * Clear all registered providers (for testing).
 */
export function clearProviders(): void {
  providers.clear();
}
