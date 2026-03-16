/**
 * API key subcommand registration
 */

import { Command } from "commander";
import { listCommand } from "./list.js";
import { createCommand } from "./create.js";
import { revokeCommand } from "./revoke.js";

export function registerApiKeyCommands(program: Command): void {
  const apiKey = new Command("api-key")
    .description("Manage API keys")
    .action(() => {
      apiKey.help();
    });

  apiKey
    .command("list")
    .alias("ls")
    .description("List all API keys")
    .option("--json", "Output as JSON")
    .action(listCommand);

  apiKey
    .command("create")
    .description("Create a new API key")
    .action(createCommand);

  apiKey
    .command("revoke")
    .description("Revoke an API key")
    .argument("<id>", "API key credential ID")
    .option("--force", "Skip confirmation")
    .action(revokeCommand);

  program.addCommand(apiKey);
}
