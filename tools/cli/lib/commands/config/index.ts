/**
 * Config subcommand registration
 */

import { Command } from "commander";
import { validateCommand } from "./validate.js";
import { showCommand } from "./show.js";
import { envCommand } from "./env.js";
import { dbCommand } from "./db.js";

export function registerConfigCommands(program: Command): void {
  const config = new Command("config")
    .description("Manage configuration")
    .alias("cfg")
    .action(() => {
      config.help();
    });

  config
    .command("validate")
    .description("Validate AI configuration")
    .action(validateCommand);

  config
    .command("show")
    .description("Show effective AI configuration")
    .action(showCommand);

  config
    .command("env")
    .description("Show resolved environment variables")
    .action(envCommand);

  config
    .command("db")
    .description("Show database connection status")
    .action(dbCommand);

  program.addCommand(config);
}
