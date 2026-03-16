import { getChannelRegistry } from "../../db/adapters.js";
import { getChannel, updateChannel } from "../../db/channels.js";
import { colors, icons } from "../../ui/colors.js";
import {
  intro,
  outro,
  cancel,
  textInput,
  passwordInput,
  selectOne,
  selectMany,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

export async function editCommand(id: string): Promise<void> {
  try {
    const channel = await getChannel(id);
    if (!channel) {
      cancel(`Channel not found: ${id}`);
      process.exit(1);
    }

    // Decrypt current config for display
    const registry = getChannelRegistry();
    const adapter = registry.get(
      channel.platform as "telegram" | "discord" | "slack",
    );
    const decrypted = adapter.decryptConfig(channel.config);

    intro(colors.header(`Edit Channel: ${channel.name} (${channel.platform})`));

    // Prompt for fields to edit
    const fieldsToEdit = await selectMany<string>({
      message: "Select fields to edit:",
      options: [
        { value: "name", label: "Name" },
        { value: "capability", label: "Capability" },
        { value: "config", label: "Platform config" },
      ],
    });

    if (fieldsToEdit.length === 0) {
      outro(colors.dim("No changes made."));
      return;
    }

    const updates: Record<string, unknown> = {};

    for (const field of fieldsToEdit) {
      if (field === "name") {
        const name = await textInput({
          message: "New name:",
          defaultValue: channel.name,
          validate: (input: string) => {
            if (input.length === 0) return "Name is required";
            return undefined;
          },
        });
        updates.name = name;
      }

      if (field === "capability") {
        const capability = await selectOne<string>({
          message: "New capability:",
          options: [
            { value: "notification", label: "Notification" },
            { value: "chat", label: "Chat" },
            { value: "bidirectional", label: "Bidirectional" },
          ],
        });
        updates.capability = capability;
      }

      if (field === "config" && decrypted) {
        // Show current config fields and prompt for updates
        const configUpdates: Record<string, unknown> = { ...decrypted };

        for (const [key, currentValue] of Object.entries(decrypted)) {
          const isSecret =
            key.includes("token") ||
            key.includes("key") ||
            key.includes("secret");
          const displayValue = isSecret
            ? `${String(currentValue).substring(0, 8)}...`
            : String(currentValue);

          if (isSecret) {
            const value = await passwordInput({
              message: `${key} (current: ${displayValue}):`,
            });

            // Keep current value if empty (for secrets)
            if (value === "") continue;
            configUpdates[key] = value;
          } else {
            const value = await textInput({
              message: `${key}:`,
              defaultValue: String(currentValue),
            });

            if (value !== "") configUpdates[key] = value;
          }
        }

        // Re-encrypt the updated config
        const encryptedConfig =
          await adapter.validateAndEncryptConfig(configUpdates);
        updates.config = encryptedConfig;
      }
    }

    if (Object.keys(updates).length === 0) {
      outro(colors.dim("No changes made."));
      return;
    }

    await updateChannel(id, updates as Parameters<typeof updateChannel>[1]);

    outro(colors.success(`${icons.success} Channel updated: ${channel.name}`));
  } catch (error) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      return;
    }
    cancel(
      `Failed to edit channel: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  }
}
