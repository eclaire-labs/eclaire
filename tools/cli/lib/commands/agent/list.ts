import { listAgents } from "../../db/agents.js";
import { getDefaultUser } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createAgentsTable } from "../../ui/format.js";

export async function listCommand(options: { json?: boolean }): Promise<void> {
  try {
    const user = await getDefaultUser();
    const agents = await listAgents(user.id);
    await closeDb();

    if (options.json) {
      console.log(JSON.stringify(agents, null, 2));
      return;
    }

    if (agents.length === 0) {
      console.log(
        colors.warning(
          `\n  ${icons.warning} No agents configured. Use ${colors.emphasis("eclaire agent create")} to create one.\n`,
        ),
      );
      return;
    }

    console.log(
      colors.header(`\n  ${icons.robot} Agents (${agents.length})\n`),
    );
    console.log(createAgentsTable(agents));

    console.log(colors.dim("\nCommands:"));
    console.log(
      colors.dim("  eclaire agent create        - Create a new agent"),
    );
    console.log(
      colors.dim("  eclaire agent info <id>     - Show agent details"),
    );
    console.log(colors.dim("  eclaire agent edit <id>     - Edit an agent"));
    console.log(colors.dim("  eclaire agent remove <id>   - Remove an agent"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      colors.error(`\n  ${icons.error} Failed to list agents: ${message}\n`),
    );
    await closeDb();
    process.exit(1);
  }
}
