import { getAgent, deleteAgent } from "../../db/agents.js";
import { getDefaultUser } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createAgentInfoTable } from "../../ui/format.js";
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
    const user = await getDefaultUser();
    const agent = await getAgent(user.id, id);

    if (!agent) {
      console.error(
        colors.error(`\n  ${icons.error} Agent not found: ${id}\n`),
      );
      await closeDb();
      process.exit(1);
    }

    // Show agent info
    console.log(colors.header(`\n  ${icons.robot} Agent: ${agent.name}\n`));
    console.log(createAgentInfoTable(agent));
    console.log();

    if (!options.force) {
      const confirmed = await confirm({
        message: `Remove agent "${agent.name}"? This cannot be undone.`,
        initialValue: false,
      });

      if (!confirmed) {
        cancel("Cancelled");
        await closeDb();
        return;
      }
    }

    const deleted = await deleteAgent(id);
    await closeDb();

    if (deleted) {
      console.log(
        colors.success(`\n  ${icons.success} Agent removed: ${agent.name}\n`),
      );
    } else {
      console.error(
        colors.error(`\n  ${icons.error} Failed to remove agent\n`),
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
      colors.error(`\n  ${icons.error} Failed to remove agent: ${message}\n`),
    );
    await closeDb();
    process.exit(1);
  }
}
