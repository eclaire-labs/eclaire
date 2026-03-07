import {
  loadModelsConfiguration,
  loadProvidersConfiguration,
  loadSelectionConfiguration,
} from "@eclaire/ai";
import { colors, icons } from "../../ui/colors.js";
import { createProvidersTable, createActiveModelsTable } from "../../ui/tables.js";

export async function showCommand(): Promise<void> {
  try {
    const providers = loadProvidersConfiguration();
    const models = loadModelsConfiguration();
    const selection = loadSelectionConfiguration();

    // Show providers
    console.log(colors.header(`\n  ${icons.plug} Providers\n`));
    console.log(createProvidersTable(providers.providers));

    // Show active models
    const modelsList = Object.entries(models.models).map(([id, model]) => ({
      id,
      model,
    }));
    const activeModels = {
      backend: selection.active.backend
        ? modelsList.find((m) => m.id === selection.active.backend)
        : undefined,
      workers: selection.active.workers
        ? modelsList.find((m) => m.id === selection.active.workers)
        : undefined,
    };

    console.log(colors.header(`\n  ${icons.robot} Active Models\n`));
    console.log(createActiveModelsTable(activeModels, modelsList));

    // Summary
    console.log(
      colors.dim(
        `\n  ${Object.keys(providers.providers).length} providers, ${Object.keys(models.models).length} models configured\n`,
      ),
    );
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to load config: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
