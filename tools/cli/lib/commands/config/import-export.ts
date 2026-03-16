/**
 * Config import/export commands
 *
 * Import: load JSON config files into the database
 * Export: dump database config to JSON files
 */

import * as fs from "node:fs";
import * as path from "node:path";
import ora from "ora";
import { eq } from "drizzle-orm";
import type { pgSchema } from "@eclaire/db";
import type {
  ModelsConfiguration,
  ProvidersConfiguration,
  SelectionConfiguration,
} from "@eclaire/ai";
import { getDb, closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";

type Schema = typeof pgSchema;

export async function importCommand(options: { dir?: string }): Promise<void> {
  const configDir = options.dir
    ? path.resolve(options.dir)
    : path.resolve("config/ai");

  console.log(
    colors.header(`\n  ${icons.gear} Import AI Configuration from JSON\n`),
  );
  console.log(colors.dim(`  Source: ${configDir}\n`));

  const { db, schema } = getDb();
  const s = schema as Schema;
  const d = db as ReturnType<
    typeof import("drizzle-orm/postgres-js").drizzle<Schema>
  >;

  const spinner = ora("Importing configuration...").start();
  let providers = 0;
  let models = 0;
  let selections = 0;

  try {
    // Import providers
    const providersPath = path.join(configDir, "providers.json");
    if (fs.existsSync(providersPath)) {
      const raw = JSON.parse(
        fs.readFileSync(providersPath, "utf-8"),
      ) as ProvidersConfiguration;
      for (const [id, config] of Object.entries(raw.providers)) {
        await d
          .insert(s.aiProviders)
          .values({
            id,
            dialect: config.dialect,
            baseUrl: config.baseUrl,
            auth: config.auth,
            headers: config.headers ?? null,
            engine: config.engine ?? null,
            overrides: config.overrides ?? null,
            cli: config.cli ?? null,
          })
          .onConflictDoUpdate({
            target: s.aiProviders.id,
            set: {
              dialect: config.dialect,
              baseUrl: config.baseUrl,
              auth: config.auth,
              headers: config.headers ?? null,
              engine: config.engine ?? null,
              overrides: config.overrides ?? null,
              cli: config.cli ?? null,
              updatedAt: new Date(),
            },
          });
        providers++;
      }
    }

    // Import models
    const modelsPath = path.join(configDir, "models.json");
    if (fs.existsSync(modelsPath)) {
      const raw = JSON.parse(
        fs.readFileSync(modelsPath, "utf-8"),
      ) as ModelsConfiguration;
      for (const [id, config] of Object.entries(raw.models)) {
        await d
          .insert(s.aiModels)
          .values({
            id,
            name: config.name,
            providerId: config.provider,
            providerModel: config.providerModel,
            capabilities: config.capabilities,
            tokenizer: config.tokenizer ?? null,
            source: config.source ?? null,
            pricing: config.pricing ?? null,
          })
          .onConflictDoUpdate({
            target: s.aiModels.id,
            set: {
              name: config.name,
              providerId: config.provider,
              providerModel: config.providerModel,
              capabilities: config.capabilities,
              tokenizer: config.tokenizer ?? null,
              source: config.source ?? null,
              pricing: config.pricing ?? null,
              updatedAt: new Date(),
            },
          });
        models++;
      }
    }

    // Import selection
    const selectionPath = path.join(configDir, "selection.json");
    if (fs.existsSync(selectionPath)) {
      const raw = JSON.parse(
        fs.readFileSync(selectionPath, "utf-8"),
      ) as SelectionConfiguration;
      for (const [context, modelId] of Object.entries(raw.active)) {
        if (!modelId) continue;
        await d
          .insert(s.aiModelSelection)
          .values({ context, modelId })
          .onConflictDoUpdate({
            target: s.aiModelSelection.context,
            set: { modelId, updatedAt: new Date() },
          });
        selections++;
      }
    }

    spinner.succeed("Configuration imported successfully");
    console.log(
      colors.dim(
        `  ${providers} providers, ${models} models, ${selections} selections\n`,
      ),
    );
  } catch (error) {
    spinner.fail("Failed to import configuration");
    console.error(
      colors.error(
        `  ${icons.error} ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  } finally {
    await closeDb();
  }
}

export async function exportCommand(options: { dir?: string }): Promise<void> {
  const outputDir = options.dir
    ? path.resolve(options.dir)
    : path.resolve("config/ai");

  console.log(
    colors.header(`\n  ${icons.gear} Export AI Configuration to JSON\n`),
  );
  console.log(colors.dim(`  Destination: ${outputDir}\n`));

  const { db, schema } = getDb();
  const d = db as ReturnType<
    typeof import("drizzle-orm/postgres-js").drizzle<Schema>
  >;

  const spinner = ora("Exporting configuration...").start();

  try {
    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Export providers
    const providerRows = await d.query.aiProviders.findMany();
    const providers: Record<string, Record<string, unknown>> = {};
    for (const row of providerRows) {
      const config: Record<string, unknown> = {
        dialect: row.dialect,
        baseUrl: row.baseUrl,
        auth: row.auth,
      };
      if (row.headers) config.headers = row.headers;
      if (row.engine) config.engine = row.engine;
      if (row.overrides) config.overrides = row.overrides;
      if (row.cli) config.cli = row.cli;
      providers[row.id] = config;
    }
    fs.writeFileSync(
      path.join(outputDir, "providers.json"),
      JSON.stringify({ providers }, null, 2) + "\n",
    );

    // Export models
    const modelRows = await d.query.aiModels.findMany();
    const models: Record<string, Record<string, unknown>> = {};
    for (const row of modelRows) {
      const config: Record<string, unknown> = {
        name: row.name,
        provider: row.providerId,
        providerModel: row.providerModel,
        capabilities: row.capabilities,
      };
      if (row.tokenizer) config.tokenizer = row.tokenizer;
      if (row.source) config.source = row.source;
      if (row.pricing) config.pricing = row.pricing;
      models[row.id] = config;
    }
    fs.writeFileSync(
      path.join(outputDir, "models.json"),
      JSON.stringify({ models }, null, 2) + "\n",
    );

    // Export selection
    const selectionRows = await d.query.aiModelSelection.findMany();
    const active: Record<string, string> = {};
    for (const row of selectionRows) {
      active[row.context] = row.modelId;
    }
    fs.writeFileSync(
      path.join(outputDir, "selection.json"),
      JSON.stringify({ active }, null, 2) + "\n",
    );

    spinner.succeed("Configuration exported successfully");
    console.log(
      colors.dim(
        `  ${Object.keys(providers).length} providers, ${Object.keys(models).length} models, ${Object.keys(active).length} selections\n`,
      ),
    );
  } catch (error) {
    spinner.fail("Failed to export configuration");
    console.error(
      colors.error(
        `  ${icons.error} ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  } finally {
    await closeDb();
  }
}
