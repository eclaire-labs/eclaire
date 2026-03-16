/**
 * Agent subcommand registration
 */

import { Command } from "commander";
import { listCommand } from "./list.js";
import { infoCommand } from "./info.js";
import { createCommand } from "./create.js";
import { editCommand } from "./edit.js";
import { removeCommand } from "./remove.js";

export function registerAgentCommands(program: Command): void {
  const agent = new Command("agent").description("Manage agents").action(() => {
    agent.help();
  });

  agent
    .command("list")
    .alias("ls")
    .description("List all agents")
    .option("--json", "Output as JSON")
    .action(listCommand);

  agent
    .command("info")
    .description("Show agent details")
    .argument("<id>", "Agent ID")
    .action(infoCommand);

  agent
    .command("create")
    .description("Create a new agent")
    .action(createCommand);

  agent
    .command("edit")
    .description("Edit an agent")
    .argument("<id>", "Agent ID")
    .action(editCommand);

  agent
    .command("remove")
    .alias("rm")
    .description("Remove an agent")
    .argument("<id>", "Agent ID")
    .option("--force", "Skip confirmation")
    .action(removeCommand);

  program.addCommand(agent);
}
