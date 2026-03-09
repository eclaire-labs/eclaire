import chalk from "chalk";
import { listChannels } from "../../db/channels.js";
import { colors, icons } from "../../ui/colors.js";
import { createChannelsTable } from "../../ui/tables.js";

export async function listCommand(options: {
  json?: boolean;
  platform?: string;
}): Promise<void> {
  try {
    const channels = await listChannels(undefined, options.platform);

    if (options.json) {
      console.log(JSON.stringify(channels, null, 2));
      return;
    }

    if (channels.length === 0) {
      console.log(
        chalk.yellow(
          `\n  ${icons.info} No channels configured. Use ${colors.emphasis("eclaire channel add")} to add one.\n`,
        ),
      );
      return;
    }

    console.log(
      colors.header(`\n  ${icons.plug} Channels (${channels.length})\n`),
    );
    console.log(createChannelsTable(channels));
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to list channels: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
