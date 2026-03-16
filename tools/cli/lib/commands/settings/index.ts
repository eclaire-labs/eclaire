/**
 * Settings subcommand registration
 */

import { Command } from "commander";
import { listCommand } from "./list.js";
import { getCommand } from "./get.js";
import { setCommand } from "./set.js";

export function registerSettingsCommands(program: Command): void {
  const settings = new Command("settings")
    .description("Manage instance settings")
    .action(() => {
      settings.help();
    });

  settings
    .command("list")
    .description("List all instance settings")
    .option("--json", "Output as JSON")
    .action(listCommand);

  settings
    .command("get")
    .description("Get an instance setting")
    .argument("<key>", "Setting key")
    .action(getCommand);

  settings
    .command("set")
    .description("Set an instance setting")
    .argument("<key>", "Setting key")
    .argument("<value>", "Setting value")
    .action(setCommand);

  program.addCommand(settings);
}
