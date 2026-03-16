/**
 * MCP server subcommand registration
 */

import { Command } from "commander";
import { listCommand } from "./list.js";
import { addCommand } from "./add.js";
import { editCommand } from "./edit.js";
import { removeCommand } from "./remove.js";
import { enableCommand, disableCommand } from "./toggle.js";

export function registerMcpCommands(program: Command): void {
  const mcp = new Command("mcp")
    .description("Manage MCP servers")
    .action(() => {
      mcp.help();
    });

  mcp
    .command("list")
    .alias("ls")
    .description("List all MCP servers")
    .option("--json", "Output as JSON")
    .action(listCommand);

  mcp.command("add").description("Add a new MCP server").action(addCommand);

  mcp
    .command("edit <id>")
    .description("Edit an MCP server")
    .action(editCommand);

  mcp
    .command("remove <id>")
    .alias("rm")
    .description("Remove an MCP server")
    .option("--force", "Skip confirmation")
    .action(removeCommand);

  mcp
    .command("enable <id>")
    .description("Enable an MCP server")
    .action(enableCommand);

  mcp
    .command("disable <id>")
    .description("Disable an MCP server")
    .action(disableCommand);

  program.addCommand(mcp);
}
