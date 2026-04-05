/**
 * AI Configuration Service
 *
 * DB-backed CRUD for AI providers, models, and model selection.
 * The database is the sole runtime source of truth for AI config.
 */

import { eq } from "drizzle-orm";
import type {
  ModelConfig,
  ModelsConfiguration,
  ProviderConfig,
  ProvidersConfiguration,
  SelectionConfiguration,
} from "@eclaire/ai";
import type { ImportModelsResult } from "./ai-import-types.js";
import { setInlineConfig } from "@eclaire/ai";
import { db, schema } from "../../db/index.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("services:ai-config");

const { aiProviders, aiModels, aiModelSelection, mcpServers } = schema;

// =============================================================================
// Providers
// =============================================================================

export async function listProviders() {
  return db.query.aiProviders.findMany();
}

export async function getProvider(id: string) {
  return db.query.aiProviders.findFirst({
    where: eq(aiProviders.id, id),
  });
}

export async function createProvider(
  id: string,
  config: ProviderConfig,
  updatedBy?: string,
) {
  const existing = await getProvider(id);
  if (existing) {
    throw new ValidationError(`Provider "${id}" already exists`);
  }
  await db.insert(aiProviders).values({
    id,
    dialect: config.dialect,
    baseUrl: config.baseUrl,
    auth: config.auth,
    headers: config.headers ?? null,
    engine: config.engine ?? null,
    overrides: config.overrides ?? null,
    cli: config.cli ?? null,
    updatedBy: updatedBy ?? null,
  });
  await invalidateCaches();
  logger.info({ providerId: id }, "Provider created");
}

export async function updateProvider(
  id: string,
  config: Partial<ProviderConfig>,
  updatedBy?: string,
) {
  const existing = await getProvider(id);
  if (!existing) {
    throw new NotFoundError("Provider", id);
  }
  await db
    .update(aiProviders)
    .set({
      ...(config.dialect !== undefined && { dialect: config.dialect }),
      ...(config.baseUrl !== undefined && { baseUrl: config.baseUrl }),
      ...(config.auth !== undefined && { auth: config.auth }),
      ...(config.headers !== undefined && { headers: config.headers }),
      ...(config.engine !== undefined && { engine: config.engine }),
      ...(config.overrides !== undefined && { overrides: config.overrides }),
      ...(config.cli !== undefined && { cli: config.cli }),
      updatedAt: new Date(),
      updatedBy: updatedBy ?? null,
    })
    .where(eq(aiProviders.id, id));
  await invalidateCaches();
  logger.info({ providerId: id }, "Provider updated");
}

export async function deleteProvider(id: string) {
  const existing = await getProvider(id);
  if (!existing) {
    throw new NotFoundError("Provider", id);
  }
  await db.delete(aiProviders).where(eq(aiProviders.id, id));
  await invalidateCaches();
  logger.info({ providerId: id }, "Provider deleted");
}

/**
 * Test a provider connection by hitting its /models endpoint.
 */
export async function testProviderConnection(providerId: string): Promise<{
  success: boolean;
  status?: number;
  statusText?: string;
  error?: string;
}> {
  const provider = await getProvider(providerId);
  if (!provider) {
    throw new NotFoundError("Provider", providerId);
  }
  const { interpolateEnvVars } = await import("@eclaire/ai");
  const baseUrl = provider.baseUrl
    ? interpolateEnvVars(provider.baseUrl, false)
    : null;
  if (!baseUrl) {
    return { success: false, error: "No base URL configured" };
  }
  const testUrl = `${baseUrl.replace(/\/+$/, "")}/models`;
  const headers: Record<string, string> = {};
  const auth = provider.auth as {
    type: string;
    header?: string;
    value?: string;
  };
  if (auth?.type === "bearer" && auth.value) {
    headers.Authorization = `Bearer ${interpolateEnvVars(auth.value, false)}`;
  } else if (auth?.type === "header" && auth.header && auth.value) {
    headers[auth.header] = interpolateEnvVars(auth.value, false);
  }
  const response = await fetch(testUrl, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  return {
    success: response.ok,
    status: response.status,
    statusText: response.statusText,
  };
}

// =============================================================================
// Models
// =============================================================================

export async function listModels() {
  return db.query.aiModels.findMany();
}

export async function getModel(id: string) {
  return db.query.aiModels.findFirst({
    where: eq(aiModels.id, id),
  });
}

export async function createModel(
  id: string,
  config: ModelConfig,
  updatedBy?: string,
) {
  const existing = await getModel(id);
  if (existing) {
    throw new ValidationError(`Model "${id}" already exists`);
  }
  // Verify provider exists
  const provider = await getProvider(config.provider);
  if (!provider) {
    throw new ValidationError(`Provider "${config.provider}" not found`);
  }
  await db.insert(aiModels).values({
    id,
    name: config.name,
    providerId: config.provider,
    providerModel: config.providerModel,
    capabilities: config.capabilities,
    tokenizer: config.tokenizer ?? null,
    source: config.source ?? null,
    pricing: config.pricing ?? null,
    updatedBy: updatedBy ?? null,
  });
  await invalidateCaches();
  logger.info({ modelId: id }, "Model created");
}

export async function updateModel(
  id: string,
  config: Partial<ModelConfig>,
  updatedBy?: string,
) {
  const existing = await getModel(id);
  if (!existing) {
    throw new NotFoundError("Model", id);
  }
  await db
    .update(aiModels)
    .set({
      ...(config.name !== undefined && { name: config.name }),
      ...(config.provider !== undefined && { providerId: config.provider }),
      ...(config.providerModel !== undefined && {
        providerModel: config.providerModel,
      }),
      ...(config.capabilities !== undefined && {
        capabilities: config.capabilities,
      }),
      ...(config.tokenizer !== undefined && { tokenizer: config.tokenizer }),
      ...(config.source !== undefined && { source: config.source }),
      ...(config.pricing !== undefined && { pricing: config.pricing }),
      updatedAt: new Date(),
      updatedBy: updatedBy ?? null,
    })
    .where(eq(aiModels.id, id));
  await invalidateCaches();
  logger.info({ modelId: id }, "Model updated");
}

export async function deleteModel(id: string) {
  const existing = await getModel(id);
  if (!existing) {
    throw new NotFoundError("Model", id);
  }
  await db.delete(aiModels).where(eq(aiModels.id, id));
  await invalidateCaches();
  logger.info({ modelId: id }, "Model deleted");
}

// =============================================================================
// Batch Import
// =============================================================================

/**
 * Import multiple models in one operation, optionally setting defaults.
 * Skips models that already exist instead of failing.
 * Invalidates caches once at the end.
 */
export async function importModels(
  entries: Array<{ id: string; config: ModelConfig }>,
  defaults?: { backend?: string; workers?: string },
  updatedBy?: string,
): Promise<ImportModelsResult> {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const entry of entries) {
    const existing = await getModel(entry.id);
    if (existing) {
      skipped.push(entry.id);
      continue;
    }
    const provider = await getProvider(entry.config.provider);
    if (!provider) {
      logger.warn(
        { modelId: entry.id, provider: entry.config.provider },
        "Skipping import: provider not found",
      );
      skipped.push(entry.id);
      continue;
    }
    await db.insert(aiModels).values({
      id: entry.id,
      name: entry.config.name,
      providerId: entry.config.provider,
      providerModel: entry.config.providerModel,
      capabilities: entry.config.capabilities,
      tokenizer: entry.config.tokenizer ?? null,
      source: entry.config.source ?? null,
      pricing: entry.config.pricing ?? null,
      updatedBy: updatedBy ?? null,
    });
    created.push(entry.id);
  }

  const appliedDefaults: Record<string, string> = {};
  if (defaults) {
    for (const [context, modelId] of Object.entries(defaults)) {
      if (!modelId) continue;
      // Only set default if the model exists (either just created or pre-existing)
      const model = await getModel(modelId);
      if (model) {
        await db
          .insert(aiModelSelection)
          .values({
            context,
            modelId,
            updatedBy: updatedBy ?? null,
          })
          .onConflictDoUpdate({
            target: aiModelSelection.context,
            set: {
              modelId,
              updatedAt: new Date(),
              updatedBy: updatedBy ?? null,
            },
          });
        appliedDefaults[context] = modelId;
      }
    }
  }

  if (created.length > 0 || Object.keys(appliedDefaults).length > 0) {
    await invalidateCaches();
  }

  logger.info(
    {
      created: created.length,
      skipped: skipped.length,
      defaults: appliedDefaults,
    },
    "Models imported",
  );

  return { created, skipped, defaults: appliedDefaults };
}

// =============================================================================
// Model Selection
// =============================================================================

export async function getAllSelections(): Promise<Record<string, string>> {
  const rows = await db.query.aiModelSelection.findMany();
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.context] = row.modelId;
  }
  return result;
}

export async function getActiveModelForContext(
  context: string,
): Promise<string | null> {
  const row = await db.query.aiModelSelection.findFirst({
    where: eq(aiModelSelection.context, context),
  });
  return row?.modelId ?? null;
}

export async function setActiveModelForContext(
  context: string,
  modelId: string,
  updatedBy?: string,
) {
  // Verify model exists
  const model = await getModel(modelId);
  if (!model) {
    throw new ValidationError(`Model "${modelId}" not found`);
  }
  await db
    .insert(aiModelSelection)
    .values({
      context,
      modelId,
      updatedBy: updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: aiModelSelection.context,
      set: {
        modelId,
        updatedAt: new Date(),
        updatedBy: updatedBy ?? null,
      },
    });
  await invalidateCaches();
  logger.info({ context, modelId }, "Model selection updated");
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Rebuild the in-memory config caches from DB data.
 * Call after any write operation to keep the AI package in sync.
 */
async function invalidateCaches() {
  await loadConfigFromDb();
}

/**
 * Load AI config from DB and seed the AI package's in-memory caches.
 * Called during startup after DB is available.
 */
export async function loadConfigFromDb(): Promise<boolean> {
  const providerRows = await listProviders();
  if (providerRows.length === 0) {
    return false; // DB is empty, no AI config yet
  }

  const modelRows = await listModels();
  const selectionRows = await db.query.aiModelSelection.findMany();

  // Build ProvidersConfiguration
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

  // Build ModelsConfiguration
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

  // Build SelectionConfiguration
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

  logger.info(
    {
      providers: Object.keys(providers).length,
      models: Object.keys(models).length,
      selections: Object.keys(active).length,
    },
    "AI configuration loaded from database",
  );

  return true;
}

// =============================================================================
// MCP Servers CRUD
// =============================================================================

export async function listMcpServers() {
  return db.query.mcpServers.findMany();
}

export async function getMcpServer(id: string) {
  return db.query.mcpServers.findFirst({
    where: eq(mcpServers.id, id),
  });
}

export async function createMcpServer(
  id: string,
  config: {
    name: string;
    description?: string;
    transport: string;
    command?: string;
    args?: string[];
    connectTimeout?: number;
    enabled?: boolean;
    toolMode?: string;
    availability?: Record<string, unknown>;
  },
  updatedBy?: string,
) {
  const existing = await getMcpServer(id);
  if (existing) {
    throw new ValidationError(`MCP server "${id}" already exists`);
  }
  await db.insert(mcpServers).values({
    id,
    name: config.name,
    description: config.description ?? null,
    transport: config.transport as "stdio" | "sse" | "http",
    command: config.command ?? null,
    args: config.args ?? null,
    connectTimeout: config.connectTimeout ?? null,
    enabled: config.enabled !== false,
    toolMode: config.toolMode ?? "managed",
    availability: config.availability ?? null,
    updatedBy: updatedBy ?? null,
  });
  logger.info({ mcpServerId: id }, "MCP server created");
}

export async function updateMcpServer(
  id: string,
  config: Partial<{
    name: string;
    description: string;
    transport: string;
    command: string;
    args: string[];
    connectTimeout: number;
    enabled: boolean;
    toolMode: string;
    availability: Record<string, unknown>;
  }>,
  updatedBy?: string,
) {
  const existing = await getMcpServer(id);
  if (!existing) {
    throw new NotFoundError("MCP server", id);
  }
  await db
    .update(mcpServers)
    .set({
      ...(config.name !== undefined && { name: config.name }),
      ...(config.description !== undefined && {
        description: config.description,
      }),
      ...(config.transport !== undefined && {
        transport: config.transport as "stdio" | "sse" | "http",
      }),
      ...(config.command !== undefined && { command: config.command }),
      ...(config.args !== undefined && { args: config.args }),
      ...(config.connectTimeout !== undefined && {
        connectTimeout: config.connectTimeout,
      }),
      ...(config.enabled !== undefined && { enabled: config.enabled }),
      ...(config.toolMode !== undefined && { toolMode: config.toolMode }),
      ...(config.availability !== undefined && {
        availability: config.availability,
      }),
      updatedAt: new Date(),
      updatedBy: updatedBy ?? null,
    })
    .where(eq(mcpServers.id, id));
  logger.info({ mcpServerId: id }, "MCP server updated");
}

export async function deleteMcpServer(id: string) {
  const existing = await getMcpServer(id);
  if (!existing) {
    throw new NotFoundError("MCP server", id);
  }
  await db.delete(mcpServers).where(eq(mcpServers.id, id));
  logger.info({ mcpServerId: id }, "MCP server deleted");
}
