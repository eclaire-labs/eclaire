import inquirer from "inquirer";
import { getProviderById, updateProvider } from "../../config/providers.js";
import type { ProviderConfig } from "../../types/index.js";
import { colors, icons } from "../../ui/colors.js";
import { promptProviderFields } from "../../ui/prompts.js";
import { createProviderInfoTable } from "../../ui/tables.js";

export async function editCommand(id: string): Promise<void> {
  try {
    const provider = getProviderById(id);

    if (!provider) {
      console.log(colors.error(`${icons.error} Provider not found: ${id}`));
      process.exit(1);
    }

    console.log(colors.header(`${icons.gear} Edit Provider: ${id}\n`));

    // Show current configuration
    console.log(colors.subheader("Current Configuration:"));
    console.log(createProviderInfoTable(id, provider));

    // Prompt for fields to edit
    const updates = await promptProviderFields(provider);

    if (Object.keys(updates).length === 0) {
      console.log(colors.dim("\nNo changes selected"));
      return;
    }

    // Show updated configuration
    const updatedConfig: ProviderConfig = {
      ...provider,
      ...updates,
    };

    console.log(colors.subheader("\nUpdated Configuration:"));
    console.log(createProviderInfoTable(id, updatedConfig));

    // Confirm changes
    const { proceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: "Save these changes?",
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(colors.dim("Cancelled by user"));
      return;
    }

    // Apply updates
    updateProvider(id, updates);

    console.log(
      colors.success(
        `\n${icons.success} Provider '${id}' updated successfully!`,
      ),
    );
    console.log(colors.dim(`\nTest connectivity: eclaire provider test ${id}`));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("User force closed")) {
      console.log(colors.dim("\nCancelled by user"));
      return;
    }
    console.log(
      colors.error(`${icons.error} Failed to edit provider: ${message}`),
    );
    process.exit(1);
  }
}
