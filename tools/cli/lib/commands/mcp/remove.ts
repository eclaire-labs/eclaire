import { getMcpServer, deleteMcpServer } from "../../db/mcp-servers.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createMcpServerInfoTable } from "../../ui/format.js";
import {
  cancel,
  confirm,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

export async function removeCommand(
  id: string,
  options: { force?: boolean },
): Promise<void> {
  try {
    const server = await getMcpServer(id);
    if (!server) {
      console.error(
        colors.error(`\n  ${icons.error} MCP server not found: ${id}\n`),
      );
      await closeDb();
      process.exit(1);
    }

    // Show current config
    console.log(
      colors.header(`\n  ${icons.server} MCP Server: ${server.name}\n`),
    );
    console.log(createMcpServerInfoTable(server));
    console.log();

    if (!options.force) {
      const confirmed = await confirm({
        message: `Remove MCP server "${server.name}"? This cannot be undone.`,
        initialValue: false,
      });

      if (!confirmed) {
        cancel("Cancelled");
        await closeDb();
        return;
      }
    }

    const deleted = await deleteMcpServer(id);
    await closeDb();

    if (deleted) {
      console.log(
        colors.success(
          `\n  ${icons.success} MCP server removed: ${server.name}\n`,
        ),
      );
    } else {
      console.error(
        colors.error(`\n  ${icons.error} Failed to remove MCP server\n`),
      );
      process.exit(1);
    }
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to remove MCP server: ${message}\n`,
      ),
    );
    await closeDb();
    process.exit(1);
  }
}
