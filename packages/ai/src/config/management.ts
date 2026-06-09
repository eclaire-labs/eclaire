/**
 * Model and selection management over file-based configuration.
 *
 * These support standalone reuse of this package (CLI tools or apps that
 * keep providers.json/models.json/selection.json on disk). Eclaire's
 * backend persists this state in the database and does not use them.
 */

import { createLazyLogger } from "../logger.js";
import type { AIContext, ModelConfig } from "../types.js";
import {
  loadModelsConfiguration,
  loadSelectionConfiguration,
  saveModelsConfiguration,
  saveSelectionConfiguration,
} from "./store.js";

const getLogger = createLazyLogger("ai-config");

/**
 * Add a new model to the configuration
 */
export function addModel(id: string, model: ModelConfig): void {
  const logger = getLogger();
  const config = loadModelsConfiguration();

  if (config.models[id]) {
    throw new Error(`Model with ID '${id}' already exists`);
  }

  config.models[id] = model;
  saveModelsConfiguration(config);
  logger.info({ modelId: id }, "Model added");
}

/**
 * Update an existing model
 */
export function updateModel(id: string, updates: Partial<ModelConfig>): void {
  const logger = getLogger();
  const config = loadModelsConfiguration();

  if (!config.models[id]) {
    throw new Error(`Model with ID '${id}' not found`);
  }

  config.models[id] = { ...config.models[id], ...updates };
  saveModelsConfiguration(config);
  logger.info({ modelId: id }, "Model updated");
}

/**
 * Remove a model from the configuration
 */
export function removeModel(id: string): void {
  const logger = getLogger();
  const config = loadModelsConfiguration();

  if (!config.models[id]) {
    throw new Error(`Model with ID '${id}' not found`);
  }

  delete config.models[id];
  saveModelsConfiguration(config);

  // Also remove from selection if active in any context
  const selection = loadSelectionConfiguration();
  let selectionChanged = false;

  for (const [context, activeModelId] of Object.entries(selection.active)) {
    if (activeModelId === id) {
      delete selection.active[context];
      selectionChanged = true;
    }
  }

  if (selectionChanged) {
    saveSelectionConfiguration(selection);
  }

  logger.info({ modelId: id }, "Model removed");
}

/**
 * Set active model for a context.
 * NOTE: Suitability validation should be done by the caller (CLI/backend).
 */
export function setActiveModel(context: AIContext, modelId: string): void {
  const logger = getLogger();
  const modelsConfig = loadModelsConfiguration();
  const model = modelsConfig.models[modelId];

  if (!model) {
    throw new Error(`Model with ID '${modelId}' not found`);
  }

  const selection = loadSelectionConfiguration();
  selection.active[context] = modelId;
  saveSelectionConfiguration(selection);
  logger.info({ context, modelId }, "Active model set");
}

/**
 * Remove active model for a context
 */
export function removeActiveModel(context: AIContext): void {
  const logger = getLogger();
  const selection = loadSelectionConfiguration();
  delete selection.active[context];
  saveSelectionConfiguration(selection);
  logger.info({ context }, "Active model removed");
}
