/**
 * Config subcommand registration
 */

import { Command } from "commander";
import { validateCommand } from "./validate.js";
import { showCommand } from "./show.js";
import { envCommand } from "./env.js";
import { dbCommand } from "./db.js";
import { importCommand, exportCommand } from "./import-export.js";

export function registerConfigCommands(program: Command): void {
  const config = new Command("config")
    .description("Manage configuration")
    .alias("cfg")
    .action(() => {
      config.help();
    });

  config
    .command("validate")
    .description("Validate AI configuration files")
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

  config
    .command("import")
    .description("Import AI configuration from JSON files into database")
    .option("--dir <path>", "JSON config directory (default: config/ai)")
    .action(importCommand);

  config
    .command("export")
    .description("Export AI configuration from database to JSON files")
    .option("--dir <path>", "Output directory (default: config/ai)")
    .action(exportCommand);

  program.addCommand(config);
}
