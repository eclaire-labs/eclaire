/**
 * Provider configuration CRUD operations (DB-backed)
 *
 * @deprecated Provider CRUD is being migrated to the backend admin API.
 * DB-direct functions remain as the primary path until CLI fully migrates
 * to HTTP API calls. Provider presets are now fetched from the backend via
 * fetchProviderPresets() in backend-client.ts.
 */

import { eq } from "drizzle-orm";
import type { pgSchema } from "@eclaire/db";
import { getDb } from "../db/index.js";
import type { ProviderConfig } from "../types/index.js";

type Schema = typeof pgSchema;

function getProviderTable() {
  const { db, schema } = getDb();
  return {
    db: db as ReturnType<
      typeof import("drizzle-orm/postgres-js").drizzle<Schema>
    >,
    table: (schema as Schema).aiProviders,
    modelsTable: (schema as Schema).aiModels,
  };
}

/**
 * Add a new provider
 */
export async function addProvider(
  id: string,
  config: ProviderConfig,
): Promise<void> {
  const { db, table } = getProviderTable();
  const existing = await db.query.aiProviders.findFirst({
    where: eq(table.id, id),
  });
  if (existing) {
    throw new Error(`Provider '${id}' already exists`);
  }
  await db.insert(table).values({
    id,
    dialect: config.dialect,
    baseUrl: config.baseUrl,
    auth: config.auth,
    headers: config.headers ?? null,
    engine: config.engine ?? null,
    overrides: config.overrides ?? null,
    cli: config.cli ?? null,
  });
}

/**
 * Update an existing provider
 */
export async function updateProvider(
  id: string,
  updates: Partial<ProviderConfig>,
): Promise<void> {
  const { db, table } = getProviderTable();
  const existing = await db.query.aiProviders.findFirst({
    where: eq(table.id, id),
  });
  if (!existing) {
    throw new Error(`Provider '${id}' not found`);
  }
  await db
    .update(table)
    .set({
      ...(updates.dialect !== undefined && { dialect: updates.dialect }),
      ...(updates.baseUrl !== undefined && { baseUrl: updates.baseUrl }),
      ...(updates.auth !== undefined && { auth: updates.auth }),
      ...(updates.headers !== undefined && { headers: updates.headers }),
      ...(updates.engine !== undefined && { engine: updates.engine }),
      ...(updates.overrides !== undefined && { overrides: updates.overrides }),
      ...(updates.cli !== undefined && { cli: updates.cli }),
      updatedAt: new Date(),
    })
    .where(eq(table.id, id));
}

/**
 * Remove a provider
 * Returns list of model IDs that were using this provider (for warning)
 */
export async function removeProvider(id: string): Promise<string[]> {
  const { db, table, modelsTable } = getProviderTable();
  const existing = await db.query.aiProviders.findFirst({
    where: eq(table.id, id),
  });
  if (!existing) {
    throw new Error(`Provider '${id}' not found`);
  }

  // Find models using this provider
  const affectedModels = await db.query.aiModels.findMany({
    where: eq(modelsTable.providerId, id),
    columns: { id: true },
  });

  // CASCADE will delete dependent models
  await db.delete(table).where(eq(table.id, id));

  return affectedModels.map((m) => m.id);
}

/**
 * Check if a provider ID is available
 */
export async function isProviderIdAvailable(id: string): Promise<boolean> {
  const { db, table } = getProviderTable();
  const existing = await db.query.aiProviders.findFirst({
    where: eq(table.id, id),
    columns: { id: true },
  });
  return !existing;
}

/**
 * Get all provider IDs
 */
export async function getProviderIds(): Promise<string[]> {
  const { db } = getProviderTable();
  const rows = await db.query.aiProviders.findMany({
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Get a provider by ID
 */
export async function getProviderById(
  id: string,
): Promise<ProviderConfig | undefined> {
  const { db, table } = getProviderTable();
  const row = await db.query.aiProviders.findFirst({
    where: eq(table.id, id),
  });
  if (!row) return undefined;
  return {
    dialect: row.dialect as ProviderConfig["dialect"],
    baseUrl: row.baseUrl ?? "",
    auth: row.auth as ProviderConfig["auth"],
    headers: (row.headers as ProviderConfig["headers"]) ?? undefined,
    engine: (row.engine as ProviderConfig["engine"]) ?? undefined,
    overrides: (row.overrides as ProviderConfig["overrides"]) ?? undefined,
    cli: (row.cli as ProviderConfig["cli"]) ?? undefined,
  };
}

/**
 * Get all providers
 */
export async function getAllProviders(): Promise<
  Record<string, ProviderConfig>
> {
  const { db } = getProviderTable();
  const rows = await db.query.aiProviders.findMany();
  const result: Record<string, ProviderConfig> = {};
  for (const row of rows) {
    result[row.id] = {
      dialect: row.dialect as ProviderConfig["dialect"],
      baseUrl: row.baseUrl ?? "",
      auth: row.auth as ProviderConfig["auth"],
      headers: (row.headers as ProviderConfig["headers"]) ?? undefined,
      engine: (row.engine as ProviderConfig["engine"]) ?? undefined,
      overrides: (row.overrides as ProviderConfig["overrides"]) ?? undefined,
      cli: (row.cli as ProviderConfig["cli"]) ?? undefined,
    };
  }
  return result;
}

/**
 * Get count of models using a provider
 */
export async function getModelsUsingProvider(
  providerId: string,
): Promise<string[]> {
  const { db, modelsTable } = getProviderTable();
  const rows = await db.query.aiModels.findMany({
    where: eq(modelsTable.providerId, providerId),
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}
