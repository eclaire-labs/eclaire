import { getChannel, deleteChannel } from "../../db/channels.js";
import { promptConfirmation } from "../../ui/prompts.js";
import { colors, icons } from "../../ui/colors.js";
import {
  intro,
  outro,
  cancel,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

export async function removeCommand(
  id: string,
  options: { force?: boolean },
): Promise<void> {
  try {
    const channel = await getChannel(id);
    if (!channel) {
      cancel(`Channel not found: ${id}`);
      process.exit(1);
    }

    intro(
      colors.header(`Remove Channel: ${channel.name} (${channel.platform})`),
    );

    if (!options.force) {
      const confirmed = await promptConfirmation(
        `Remove channel "${channel.name}" (${channel.platform})? This cannot be undone.`,
      );
      if (!confirmed) {
        outro(colors.dim("Cancelled."));
        return;
      }
    }

    const deleted = await deleteChannel(id);
    if (deleted) {
      outro(
        colors.success(`${icons.success} Channel removed: ${channel.name}`),
      );
    } else {
      cancel("Failed to remove channel");
      process.exit(1);
    }
  } catch (error) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      return;
    }
    cancel(
      `Failed to remove channel: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    process.exit(1);
  }
}
