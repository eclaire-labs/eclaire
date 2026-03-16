import chalk from "chalk";
import { getMcpServer, updateMcpServer } from "../../db/mcp-servers.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";

export async function enableCommand(id: string): Promise<void> {
  try {
    const server = await getMcpServer(id);
    if (!server) {
      console.error(
        colors.error(`\n  ${icons.error} MCP server not found: ${id}\n`),
      );
      process.exit(1);
    }

    if (server.enabled) {
      console.log(
        colors.dim(`\n  MCP server "${server.name}" is already enabled.\n`),
      );
      await closeDb();
      return;
    }

    await updateMcpServer(id, { enabled: true });
    await closeDb();
    console.log(
      chalk.green(`\n  ${icons.success} MCP server enabled: ${server.name}\n`),
    );
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to enable MCP server: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}

export async function disableCommand(id: string): Promise<void> {
  try {
    const server = await getMcpServer(id);
    if (!server) {
      console.error(
        colors.error(`\n  ${icons.error} MCP server not found: ${id}\n`),
      );
      process.exit(1);
    }

    if (!server.enabled) {
      console.log(
        colors.dim(`\n  MCP server "${server.name}" is already disabled.\n`),
      );
      await closeDb();
      return;
    }

    await updateMcpServer(id, { enabled: false });
    await closeDb();
    console.log(
      chalk.green(`\n  ${icons.success} MCP server disabled: ${server.name}\n`),
    );
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Failed to disable MCP server: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
