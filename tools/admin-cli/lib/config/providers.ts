/**
 * Provider configuration CRUD operations
 */

import {
  loadModelsConfiguration,
  loadProvidersConfiguration,
  saveProvidersConfiguration,
} from "@eclaire/ai";
import type { ProviderConfig } from "../types/index.js";

/**
 * Add a new provider
 */
export function addProvider(id: string, config: ProviderConfig): void {
  const providers = loadProvidersConfiguration();

  if (providers.providers[id]) {
    throw new Error(`Provider '${id}' already exists`);
  }

  providers.providers[id] = config;
  saveProvidersConfiguration(providers);
}

/**
 * Update an existing provider
 */
export function updateProvider(
  id: string,
  updates: Partial<ProviderConfig>,
): void {
  const providers = loadProvidersConfiguration();

  if (!providers.providers[id]) {
    throw new Error(`Provider '${id}' not found`);
  }

  const current = providers.providers[id];
  if (!current) {
    throw new Error(`Provider '${id}' not found`);
  }

  // Deep merge for auth
  const newAuth = updates.auth
    ? { ...current.auth, ...updates.auth }
    : current.auth;

  // Deep merge for overrides
  const newOverrides = updates.overrides
    ? { ...(current.overrides || {}), ...updates.overrides }
    : current.overrides;

  // Deep merge for headers
  const newHeaders = updates.headers
    ? { ...(current.headers || {}), ...updates.headers }
    : current.headers;

  providers.providers[id] = {
    ...current,
    ...updates,
    auth: newAuth,
    ...(newOverrides && { overrides: newOverrides }),
    ...(newHeaders && { headers: newHeaders }),
  };

  saveProvidersConfiguration(providers);
}

/**
 * Remove a provider
 * Returns list of model IDs that were using this provider (for warning)
 */
export function removeProvider(id: string): string[] {
  const providers = loadProvidersConfiguration();
  const models = loadModelsConfiguration();

  if (!providers.providers[id]) {
    throw new Error(`Provider '${id}' not found`);
  }

  // Find models using this provider
  const affectedModels = Object.entries(models.models)
    .filter(([_, model]) => model.provider === id)
    .map(([modelId]) => modelId);

  delete providers.providers[id];
  saveProvidersConfiguration(providers);

  return affectedModels;
}

/**
 * Check if a provider ID is available
 */
export function isProviderIdAvailable(id: string): boolean {
  const providers = loadProvidersConfiguration();
  return !providers.providers[id];
}

/**
 * Get all provider IDs
 */
export function getProviderIds(): string[] {
  const providers = loadProvidersConfiguration();
  return Object.keys(providers.providers);
}

/**
 * Get a provider by ID
 */
export function getProviderById(id: string): ProviderConfig | undefined {
  const providers = loadProvidersConfiguration();
  return providers.providers[id];
}

/**
 * Get all providers
 */
export function getAllProviders(): Record<string, ProviderConfig> {
  const providers = loadProvidersConfiguration();
  return providers.providers;
}

/**
 * Get count of models using a provider
 */
export function getModelsUsingProvider(providerId: string): string[] {
  const models = loadModelsConfiguration();
  return Object.entries(models.models)
    .filter(([_, model]) => model.provider === providerId)
    .map(([modelId]) => modelId);
}
