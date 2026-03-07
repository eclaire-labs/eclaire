/**
 * Channel subcommand registration
 */

import { Command } from "commander";
import { listCommand } from "./list.js";
import { addCommand } from "./add.js";
import { editCommand } from "./edit.js";
import { removeCommand } from "./remove.js";
import { testCommand } from "./test.js";
import { enableCommand } from "./enable.js";
import { disableCommand } from "./disable.js";

export function registerChannelCommands(program: Command): void {
  const channel = new Command("channel")
    .description("Manage communication channels")
    .alias("ch")
    .action(() => {
      channel.help();
    });

  channel
    .command("list")
    .alias("ls")
    .description("List all configured channels")
    .option("--json", "Output as JSON")
    .option("--platform <platform>", "Filter by platform (telegram, discord, slack)")
    .action(listCommand);

  channel
    .command("add")
    .description("Add a new channel")
    .action(addCommand);

  channel
    .command("edit <id>")
    .description("Edit an existing channel")
    .action(editCommand);

  channel
    .command("remove <id>")
    .alias("rm")
    .description("Remove a channel")
    .option("--force", "Skip confirmation prompt")
    .action(removeCommand);

  channel
    .command("test <id>")
    .description("Send a test message through a channel")
    .action(testCommand);

  channel
    .command("enable <id>")
    .description("Enable a channel")
    .action(enableCommand);

  channel
    .command("disable <id>")
    .description("Disable a channel")
    .action(disableCommand);

  program.addCommand(channel);
}
