import chalk from "chalk";
import { getChannel, deleteChannel } from "../../db/channels.js";
import { promptConfirmation } from "../../ui/prompts.js";
import { colors, icons } from "../../ui/colors.js";

export async function removeCommand(
  id: string,
  options: { force?: boolean },
): Promise<void> {
  try {
    const channel = await getChannel(id);
    if (!channel) {
      console.error(
        colors.error(`\n  ${icons.error} Channel not found: ${id}\n`),
      );
      process.exit(1);
    }

    if (!options.force) {
      const confirmed = await promptConfirmation(
        `Remove channel "${channel.name}" (${channel.platform})? This cannot be undone.`,
      );
      if (!confirmed) {
        console.log(colors.dim("  Cancelled.\n"));
        return;
      }
    }

    const deleted = await deleteChannel(id);
    if (deleted) {
      console.log(
        chalk.green(`\n  ${icons.success} Channel removed: ${channel.name}\n`),
      );
    } else {
      console.error(
        colors.error(`\n  ${icons.error} Failed to remove channel\n`),
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to remove channel: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
