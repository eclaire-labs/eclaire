import inquirer from "inquirer";
import chalk from "chalk";
import { getChannelRegistry } from "../../db/adapters.js";
import { getChannel, updateChannel } from "../../db/channels.js";
import { colors, icons } from "../../ui/colors.js";

export async function editCommand(id: string): Promise<void> {
  try {
    const channel = await getChannel(id);
    if (!channel) {
      console.error(colors.error(`\n  ${icons.error} Channel not found: ${id}\n`));
      process.exit(1);
    }

    // Decrypt current config for display
    const registry = getChannelRegistry();
    const adapter = registry.get(channel.platform as "telegram" | "discord" | "slack");
    const decrypted = adapter.decryptConfig(channel.config);

    console.log(colors.header(`\n  Editing channel: ${channel.name} (${channel.platform})\n`));

    // Prompt for fields to edit
    const { fieldsToEdit } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "fieldsToEdit",
        message: "Select fields to edit:",
        choices: [
          { name: "Name", value: "name" },
          { name: "Capability", value: "capability" },
          { name: "Platform config", value: "config" },
        ],
      },
    ]);

    if (fieldsToEdit.length === 0) {
      console.log(colors.dim("  No changes made.\n"));
      return;
    }

    const updates: Record<string, unknown> = {};

    for (const field of fieldsToEdit) {
      if (field === "name") {
        const { name } = await inquirer.prompt([
          {
            type: "input",
            name: "name",
            message: "New name:",
            default: channel.name,
            validate: (input: string) => input.length > 0 || "Name is required",
          },
        ]);
        updates.name = name;
      }

      if (field === "capability") {
        const { capability } = await inquirer.prompt([
          {
            type: "select",
            name: "capability",
            message: "New capability:",
            choices: [
              { name: "Notification", value: "notification" },
              { name: "Chat", value: "chat" },
              { name: "Bidirectional", value: "bidirectional" },
            ],
            default: channel.capability,
          },
        ]);
        updates.capability = capability;
      }

      if (field === "config" && decrypted) {
        // Show current config fields and prompt for updates
        const configUpdates: Record<string, unknown> = { ...decrypted };

        for (const [key, currentValue] of Object.entries(decrypted)) {
          const isSecret = key.includes("token") || key.includes("key") || key.includes("secret");
          const displayValue = isSecret
            ? `${String(currentValue).substring(0, 8)}...`
            : String(currentValue);

          const { value } = await inquirer.prompt([
            {
              type: isSecret ? "password" : "input",
              name: "value",
              message: `${key} (current: ${displayValue}):`,
              ...(isSecret ? { mask: "*" } : {}),
              default: isSecret ? "" : String(currentValue),
            },
          ]);

          // Keep current value if empty (for secrets)
          if (value === "" && isSecret) continue;
          if (value !== "") configUpdates[key] = value;
        }

        // Re-encrypt the updated config
        const encryptedConfig = await adapter.validateAndEncryptConfig(configUpdates);
        updates.config = encryptedConfig;
      }
    }

    if (Object.keys(updates).length === 0) {
      console.log(colors.dim("  No changes made.\n"));
      return;
    }

    await updateChannel(id, updates as Parameters<typeof updateChannel>[1]);

    console.log(
      chalk.green(`\n  ${icons.success} Channel updated: ${channel.name}\n`),
    );
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to edit channel: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
