import chalk from "chalk";
import { getChannel, updateChannel } from "../../db/channels.js";
import { colors, icons } from "../../ui/colors.js";

export async function disableCommand(id: string): Promise<void> {
  try {
    const channel = await getChannel(id);
    if (!channel) {
      console.error(colors.error(`\n  ${icons.error} Channel not found: ${id}\n`));
      process.exit(1);
    }

    if (!channel.isActive) {
      console.log(colors.dim(`\n  Channel "${channel.name}" is already disabled.\n`));
      return;
    }

    await updateChannel(id, { isActive: false });
    console.log(
      chalk.green(`\n  ${icons.success} Channel disabled: ${channel.name}\n`),
    );
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to disable channel: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
