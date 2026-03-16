import {
  getModelsUsingProvider,
  getProviderById,
  removeProvider,
} from "../../config/providers.js";
import { closeDb } from "../../db/index.js";
import type { CommandOptions } from "../../types/index.js";
import {
  cancel,
  CancelledError,
  intro,
  isCancelled,
  log,
  outro,
} from "../../ui/clack.js";
import { colors, icons } from "../../ui/colors.js";
import { promptConfirmation } from "../../ui/prompts.js";
import { createProviderInfoTable } from "../../ui/tables.js";

export async function removeCommand(
  id: string,
  options: CommandOptions,
): Promise<void> {
  try {
    const provider = await getProviderById(id);

    if (!provider) {
      console.log(colors.error(`${icons.error} Provider not found: ${id}`));
      process.exit(1);
    }

    intro(`${icons.warning} Remove Provider: ${id}`);

    // Show provider info
    console.log(createProviderInfoTable(id, provider));

    // Check for models using this provider
    const affectedModels = await getModelsUsingProvider(id);

    if (affectedModels.length > 0) {
      log.warn(`${affectedModels.length} model(s) use this provider:`);
      for (const modelId of affectedModels) {
        log.warn(`  - ${modelId}`);
      }
      log.warn("These models will become invalid after removing the provider.");
    }

    // Confirm removal unless --force flag
    if (!options.force) {
      const confirmed = await promptConfirmation(
        colors.warning("Are you sure you want to remove this provider?"),
        false,
      );

      if (!confirmed) {
        cancel("Cancelled");
        await closeDb();
        return;
      }
    }

    // Remove provider
    const removedAffectedModels = await removeProvider(id);
    await closeDb();

    outro(colors.success(`${icons.success} Removed provider: ${id}`));

    if (removedAffectedModels.length > 0) {
      console.log(
        colors.warning(
          `\n${icons.warning} Note: The following models now reference a non-existent provider:`,
        ),
      );
      for (const modelId of removedAffectedModels) {
        console.log(colors.warning(`  - ${modelId}`));
      }
      console.log(
        colors.dim('\nRun "eclaire config validate" to check configuration'),
      );
    }
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      colors.error(`${icons.error} Failed to remove provider: ${message}`),
    );
    await closeDb();
    process.exit(1);
  }
}
