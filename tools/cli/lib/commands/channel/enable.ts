import chalk from "chalk";
import { getChannel, updateChannel } from "../../db/channels.js";
import { colors, icons } from "../../ui/colors.js";

export async function enableCommand(id: string): Promise<void> {
  try {
    const channel = await getChannel(id);
    if (!channel) {
      console.error(colors.error(`\n  ${icons.error} Channel not found: ${id}\n`));
      process.exit(1);
    }

    if (channel.isActive) {
      console.log(colors.dim(`\n  Channel "${channel.name}" is already enabled.\n`));
      return;
    }

    await updateChannel(id, { isActive: true });
    console.log(
      chalk.green(`\n  ${icons.success} Channel enabled: ${channel.name}\n`),
    );
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to enable channel: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
