import {
  getModelsUsingProvider,
  getProviderById,
  removeProvider,
} from "../../config/providers.js";
import type { CommandOptions } from "../../types/index.js";
import { colors, icons } from "../../ui/colors.js";
import { promptConfirmation } from "../../ui/prompts.js";
import { createProviderInfoTable } from "../../ui/tables.js";

export async function removeCommand(
  id: string,
  options: CommandOptions,
): Promise<void> {
  try {
    const provider = getProviderById(id);

    if (!provider) {
      console.log(colors.error(`${icons.error} Provider not found: ${id}`));
      process.exit(1);
    }

    console.log(colors.header(`${icons.warning} Remove Provider\n`));

    // Show provider info
    console.log(createProviderInfoTable(id, provider));

    // Check for models using this provider
    const affectedModels = getModelsUsingProvider(id);

    if (affectedModels.length > 0) {
      console.log(
        colors.warning(
          `\n${icons.warning} Warning: ${affectedModels.length} model(s) use this provider:`,
        ),
      );
      affectedModels.forEach((modelId) => {
        console.log(colors.warning(`  - ${modelId}`));
      });
      console.log(
        colors.warning(
          "\nThese models will become invalid after removing the provider.",
        ),
      );
    }

    // Confirm removal unless --force flag
    if (!options.force) {
      const confirmed = await promptConfirmation(
        colors.warning("Are you sure you want to remove this provider?"),
        false,
      );

      if (!confirmed) {
        console.log(colors.dim("Cancelled by user"));
        return;
      }
    }

    // Remove provider
    const removedAffectedModels = removeProvider(id);

    console.log(colors.success(`${icons.success} Removed provider: ${id}`));

    if (removedAffectedModels.length > 0) {
      console.log(
        colors.warning(
          `\n${icons.warning} Note: The following models now reference a non-existent provider:`,
        ),
      );
      removedAffectedModels.forEach((modelId) => {
        console.log(colors.warning(`  - ${modelId}`));
      });
      console.log(
        colors.dim('\nRun "eclaire config validate" to check configuration'),
      );
    }
  } catch (error: any) {
    console.log(
      colors.error(
        `${icons.error} Failed to remove provider: ${error.message}`,
      ),
    );
    process.exit(1);
  }
}
