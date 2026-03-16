import { getProviderById, updateProvider } from "../../config/providers.js";
import { closeDb } from "../../db/index.js";
import type { ProviderConfig } from "../../types/index.js";
import {
  cancel,
  CancelledError,
  confirm,
  intro,
  isCancelled,
  outro,
} from "../../ui/clack.js";
import { colors, icons } from "../../ui/colors.js";
import { promptProviderFields } from "../../ui/prompts.js";
import { createProviderInfoTable } from "../../ui/tables.js";

export async function editCommand(id: string): Promise<void> {
  try {
    const provider = await getProviderById(id);

    if (!provider) {
      console.log(colors.error(`${icons.error} Provider not found: ${id}`));
      process.exit(1);
    }

    intro(`${icons.gear} Edit Provider: ${id}`);

    // Show current configuration
    console.log(colors.subheader("Current Configuration:"));
    console.log(createProviderInfoTable(id, provider));

    // Prompt for fields to edit
    const updates = await promptProviderFields(provider);

    if (Object.keys(updates).length === 0) {
      cancel("No changes selected");
      await closeDb();
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
    const proceed = await confirm({
      message: "Save these changes?",
      initialValue: true,
    });

    if (!proceed) {
      cancel("Cancelled");
      await closeDb();
      return;
    }

    // Apply updates
    await updateProvider(id, updates);
    await closeDb();

    outro(
      colors.success(`${icons.success} Provider '${id}' updated successfully!`),
    );
    console.log(colors.dim(`\nTest connectivity: eclaire provider test ${id}`));
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("User force closed")) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    console.log(
      colors.error(`${icons.error} Failed to edit provider: ${message}`),
    );
    await closeDb();
    process.exit(1);
  }
}
