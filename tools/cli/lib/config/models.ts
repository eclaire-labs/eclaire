/**
 * Model configuration management (DB-backed)
 *
 * CRUD operations use the database directly.
 * Read-only accessors and helpers re-exported from @eclaire/ai for compatibility.
 *
 * @deprecated Write operations (addModel, updateModel, removeModel) are being
 * migrated to the backend admin API. New code should use importModelsViaApi()
 * from backend-client.ts for imports. DB-direct functions remain for operations
 * not yet covered by the API (activate, deactivate, refresh).
 */

import { eq } from "drizzle-orm";
import type {
  AIContext,
  ModelConfig,
  ModelsConfiguration,
  ProviderConfig,
  ProvidersConfiguration,
  SelectionConfiguration,
} from "@eclaire/ai";
import {
  getActiveModelForContext,
  getActiveModelIdForContext,
  getActiveModelsAsObjects,
  getModelConfigById,
  getModels,
  getProviderConfig,
  getProviders,
  hasAllInputModalities,
  hasInputModality,
  loadModelsConfiguration,
  loadProvidersConfiguration,
  loadSelectionConfiguration,
  setInlineConfig,
} from "@eclaire/ai";
import type { pgSchema } from "@eclaire/db";
import { getDb } from "../db/index.js";

type Schema = typeof pgSchema;

function getTables() {
  const { db, schema } = getDb();
  return {
    db: db as ReturnType<
      typeof import("drizzle-orm/postgres-js").drizzle<Schema>
    >,
    models: (schema as Schema).aiModels,
    selection: (schema as Schema).aiModelSelection,
    providers: (schema as Schema).aiProviders,
  };
}

// ============================================================================
// DB-backed CRUD operations
// ============================================================================

/**
 * Add a new model to the database
 */
export async function addModel(id: string, model: ModelConfig): Promise<void> {
  const { db, models } = getTables();
  const existing = await db.query.aiModels.findFirst({
    where: eq(models.id, id),
    columns: { id: true },
  });
  if (existing) {
    throw new Error(`Model '${id}' already exists`);
  }
  await db.insert(models).values({
    id,
    name: model.name,
    providerId: model.provider,
    providerModel: model.providerModel,
    capabilities: model.capabilities,
    tokenizer: model.tokenizer ?? null,
    source: model.source ?? null,
    pricing: model.pricing ?? null,
  });
  await loadAIConfigFromDb();
}

/**
 * Update an existing model in the database
 */
export async function updateModel(
  id: string,
  updates: Partial<ModelConfig>,
): Promise<void> {
  const { db, models } = getTables();
  const existing = await db.query.aiModels.findFirst({
    where: eq(models.id, id),
    columns: { id: true },
  });
  if (!existing) {
    throw new Error(`Model '${id}' not found`);
  }
  await db
    .update(models)
    .set({
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.provider !== undefined && { providerId: updates.provider }),
      ...(updates.providerModel !== undefined && {
        providerModel: updates.providerModel,
      }),
      ...(updates.capabilities !== undefined && {
        capabilities: updates.capabilities,
      }),
      ...(updates.tokenizer !== undefined && { tokenizer: updates.tokenizer }),
      ...(updates.source !== undefined && { source: updates.source }),
      ...(updates.pricing !== undefined && { pricing: updates.pricing }),
      updatedAt: new Date(),
    })
    .where(eq(models.id, id));
  await loadAIConfigFromDb();
}

/**
 * Remove a model from the database.
 * CASCADE will clean up model selection references.
 */
export async function removeModel(id: string): Promise<void> {
  const { db, models } = getTables();
  const existing = await db.query.aiModels.findFirst({
    where: eq(models.id, id),
    columns: { id: true },
  });
  if (!existing) {
    throw new Error(`Model '${id}' not found`);
  }
  await db.delete(models).where(eq(models.id, id));
  await loadAIConfigFromDb();
}

/**
 * Set the active model for a context
 */
export async function setActiveModel(
  context: AIContext,
  modelId: string,
): Promise<void> {
  const { db, selection, models } = getTables();
  // Verify model exists
  const model = await db.query.aiModels.findFirst({
    where: eq(models.id, modelId),
    columns: { id: true },
  });
  if (!model) {
    throw new Error(`Model '${modelId}' not found`);
  }
  await db
    .insert(selection)
    .values({ context, modelId })
    .onConflictDoUpdate({
      target: selection.context,
      set: { modelId, updatedAt: new Date() },
    });
  await loadAIConfigFromDb();
}

/**
 * Remove the active model for a context
 */
export async function removeActiveModel(context: AIContext): Promise<void> {
  const { db, selection } = getTables();
  await db.delete(selection).where(eq(selection.context, context));
  await loadAIConfigFromDb();
}

/**
 * Load AI config from DB and populate the in-memory caches.
 * Called by the CLI preAction hook and after write operations.
 */
export async function loadAIConfigFromDb(): Promise<void> {
  const { db } = getTables();

  const providerRows = await db.query.aiProviders.findMany();
  const modelRows = await db.query.aiModels.findMany();
  const selectionRows = await db.query.aiModelSelection.findMany();

  const providers: Record<string, ProviderConfig> = {};
  for (const row of providerRows) {
    providers[row.id] = {
      dialect: row.dialect as ProviderConfig["dialect"],
      baseUrl: row.baseUrl ?? "",
      auth: row.auth as ProviderConfig["auth"],
      headers: (row.headers as ProviderConfig["headers"]) ?? undefined,
      engine: (row.engine as ProviderConfig["engine"]) ?? undefined,
      overrides: (row.overrides as ProviderConfig["overrides"]) ?? undefined,
      cli: (row.cli as ProviderConfig["cli"]) ?? undefined,
    };
  }

  const models: Record<string, ModelConfig> = {};
  for (const row of modelRows) {
    models[row.id] = {
      name: row.name,
      provider: row.providerId,
      providerModel: row.providerModel,
      capabilities: row.capabilities as ModelConfig["capabilities"],
      tokenizer: (row.tokenizer as ModelConfig["tokenizer"]) ?? undefined,
      source: (row.source as ModelConfig["source"]) ?? undefined,
      pricing: (row.pricing as ModelConfig["pricing"]) ?? undefined,
    };
  }

  const active: Record<string, string> = {};
  for (const row of selectionRows) {
    active[row.context] = row.modelId;
  }

  const providersConfig: ProvidersConfiguration = { providers };
  const modelsConfig: ModelsConfiguration = { models };
  const selectionConfig: SelectionConfiguration = { active };

  setInlineConfig({
    providers: providersConfig,
    models: modelsConfig,
    selection: selectionConfig,
  });
}

// ============================================================================
// Re-exports from @eclaire/ai (read-only accessors)
// ============================================================================

// Config loading (with shorter names for CLI use)
export const loadProvidersConfig = loadProvidersConfiguration;
export const loadModelsConfig = loadModelsConfiguration;
export const loadSelectionConfig = loadSelectionConfiguration;

export {
  // Accessors (with CLI-friendly aliases)
  getProviderConfig as getProvider,
  getModelConfigById as findModelById,
  getProviders,
  getModels,
  getActiveModelsAsObjects,
  getActiveModelIdForContext,
  getActiveModelForContext,
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

/**
 * Get the active model for a context with its ID
 */
export function getActiveModel(
  context: "backend" | "workers",
): { id: string; model: ModelConfig } | undefined {
  const result = getActiveModelForContext(context);
  if (!result) return undefined;

  const modelId = getActiveModelIdForContext(context);
  if (!modelId) return undefined;

  return { id: modelId, model: result };
}
