import { listMcpServers } from "../../db/mcp-servers.js";
import { closeDb } from "../../db/index.js";
import type { CommandOptions } from "../../types/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createMcpServersTable } from "../../ui/format.js";

export async function listCommand(options: CommandOptions): Promise<void> {
  try {
    console.log(colors.header(`${icons.server} MCP Servers\n`));

    const servers = await listMcpServers();
    await closeDb();

    if (servers.length === 0) {
      console.log(colors.warning(`${icons.warning} No MCP servers configured`));
      console.log(colors.dim('\nRun "eclaire mcp add" to add an MCP server'));
      return;
    }

    // Output format
    if (options.json) {
      console.log(JSON.stringify({ servers }, null, 2));
      return;
    }

    // Show summary
    console.log(colors.dim(`Found ${servers.length} server(s)\n`));

    // Show table
    console.log(createMcpServersTable(servers));

    // Show helpful commands
    console.log(colors.dim("\nCommands:"));
    console.log(
      colors.dim("  eclaire mcp add             - Add a new MCP server"),
    );
    console.log(
      colors.dim("  eclaire mcp edit <id>       - Edit an MCP server"),
    );
    console.log(
      colors.dim("  eclaire mcp enable <id>     - Enable an MCP server"),
    );
    console.log(
      colors.dim("  eclaire mcp remove <id>     - Remove an MCP server"),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      colors.error(`${icons.error} Failed to list MCP servers: ${message}`),
    );
    process.exit(1);
  }
}
