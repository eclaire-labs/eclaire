/**
 * Config subcommand registration
 */

import { Command } from "commander";
import { validateCommand } from "./validate.js";

export function registerConfigCommands(program: Command): void {
  const config = new Command("config")
    .description("Manage AI configuration")
    .alias("cfg")
    .action(() => {
      config.help();
    });

  config
    .command("validate")
    .description("Validate AI configuration files")
    .option("--fix", "Attempt to fix issues automatically")
    .action(validateCommand);

  program.addCommand(config);
}
