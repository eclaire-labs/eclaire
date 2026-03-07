/**
 * Model subcommand registration
 */

import { Command } from "commander";
import { activateCommand, deactivateCommand } from "./activate.js";
import { importCommand } from "./import.js";
import { infoCommand } from "./info.js";
import { listCommand } from "./list.js";
import { refreshCommand } from "./refresh.js";
import { removeCommand } from "./remove.js";

export function registerModelCommands(program: Command): void {
  const model = new Command("model")
    .description("Manage AI models")
    .alias("m")
    .action(() => {
      model.help();
    });

  model
    .command("list")
    .alias("ls")
    .description("List all AI models")
    .option("--context <context>", "Filter by context (backend|workers)")
    .option("--provider <provider>", "Filter by provider")
    .option("--memory", "Show estimated memory usage for local models")
    .option("--json", "Output as JSON")
    .action(listCommand);

  model
    .command("info <id>")
    .description("Show detailed information about a model")
    .action(infoCommand);

  model
    .command("activate [id]")
    .description("Activate a model (set as active for its context)")
    .option(
      "--backend <model>",
      "Set backend active model (format: provider:modelShortName)",
    )
    .option(
      "--workers <model>",
      "Set workers active model (format: provider:modelShortName)",
    )
    .action(activateCommand);

  model
    .command("deactivate [context]")
    .description("Deactivate model for a context (remove active assignment)")
    .action(deactivateCommand);

  model
    .command("import <url>")
    .description("Import a model from HuggingFace or OpenRouter URL")
    .option("--context <context>", "Set context (backend|workers|both)", "both")
    .option("--provider <provider>", "Force specific provider")
    .option("--no-interactive", "Skip interactive confirmation")
    .action(importCommand);

  model
    .command("remove <id>")
    .alias("rm")
    .description("Remove a model (with confirmation)")
    .option("--force", "Skip confirmation prompt")
    .action(removeCommand);

  model
    .command("refresh [id]")
    .description("Refresh model metadata from HuggingFace for GGUF models")
    .action((id) => refreshCommand(id));

  program.addCommand(model);
}
