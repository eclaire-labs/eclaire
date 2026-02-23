/**
 * Model configuration management
 *
 * Re-exports config functions from @eclaire/ai with CLI-specific wrappers.
 */

import type { AIContext, ModelConfig } from "@eclaire/ai";
import {
  // Model CRUD
  addModel,
  getActiveModelForContext,
  getActiveModelIdForContext,
  getActiveModelsAsObjects,
  getConfigPath,
  getModelConfigById,
  getModels,
  // Accessors
  getProviderConfig,
  getProviders,
  hasAllInputModalities,
  // Generic modality helpers
  hasInputModality,
  loadModelsConfiguration,
  // Config loading
  loadProvidersConfiguration,
  loadSelectionConfiguration,
  removeActiveModel,
  removeModel,
  saveModelsConfiguration,
  // Config saving
  saveProvidersConfiguration,
  saveSelectionConfiguration,
  // Selection management
  setActiveModel,
  // Config path
  setConfigPath,
  updateModel,
} from "@eclaire/ai";
import path from "node:path";

// ============================================================================
// CLI-specific config path initialization
// ============================================================================

// Note: Config path is initialized in main.ts preAction hook
// This allows the --verbose flag to set up the logger before any config is loaded

/**
 * Set a custom config directory (used by CLI --config option)
 */
export function setConfigDir(customDir: string): void {
  setConfigPath(path.resolve(customDir));
}

/**
 * Get the current config directory
 */
export function getConfigDir(): string {
  return getConfigPath();
}

// ============================================================================
// Re-exports with CLI-friendly names
// ============================================================================

// Config loading (with shorter names for CLI use)
export const loadProvidersConfig = loadProvidersConfiguration;
export const loadModelsConfig = loadModelsConfiguration;
export const loadSelectionConfig = loadSelectionConfiguration;

// Config saving (with shorter names for CLI use)
export const saveProvidersConfig = saveProvidersConfiguration;
export const saveModelsConfig = saveModelsConfiguration;
export const saveSelectionConfig = saveSelectionConfiguration;

// Re-export everything else
export {
  // Model CRUD
  addModel,
  updateModel,
  removeModel,
  // Selection management
  setActiveModel,
  removeActiveModel,
  // Accessors (with CLI-friendly aliases)
  getProviderConfig as getProvider,
  getModelConfigById as findModelById,
  getProviders,
  getModels,
  getActiveModelsAsObjects,
  getActiveModelIdForContext,
  getActiveModelForContext,
  // Config path (re-export for main.ts)
  setConfigPath,
};

// ============================================================================
// Suitability helpers (Eclaire-specific)
// ============================================================================

/**
 * Check if a model is suitable for backend context.
 * Backend requires text input modality.
 */
export function isModelSuitableForBackend(model: ModelConfig): boolean {
  return hasInputModality(model, "text");
}

/**
 * Check if a model is suitable for workers context.
 * Workers requires text + image input modalities (for vision tasks).
 */
export function isModelSuitableForWorkers(model: ModelConfig): boolean {
  return hasAllInputModalities(model, ["text", "image"]);
}

/**
 * Check if a model is suitable for a given context.
 */
export function isModelSuitableForContext(
  model: ModelConfig,
  context: AIContext,
): boolean {
  if (context === "backend") return isModelSuitableForBackend(model);
  if (context === "workers") return isModelSuitableForWorkers(model);
  return false;
}

// Also provide a getActiveModels helper for backward compatibility
export function getActiveModels(): { backend?: string; workers?: string } {
  return {
    backend: getActiveModelIdForContext("backend") || undefined,
    workers: getActiveModelIdForContext("workers") || undefined,
  };
}

// Provide getActiveModel helper
export function getActiveModel(
  context: "backend" | "workers",
): { id: string; model: import("@eclaire/ai").ModelConfig } | undefined {
  const result = getActiveModelForContext(context);
  if (!result) return undefined;

  const modelId = getActiveModelIdForContext(context);
  if (!modelId) return undefined;

  return { id: modelId, model: result };
}
