import { getAgentRuntimeKindForModel } from "@eclaire/ai";
import { getAgent } from "../../db/agents.js";
import { getDefaultUser } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createAgentInfoTable } from "../../ui/format.js";

export async function infoCommand(id: string): Promise<void> {
  try {
    const user = await getDefaultUser();
    const agent = await getAgent(user.id, id);
    await closeDb();

    if (!agent) {
      console.error(
        colors.error(`\n  ${icons.error} Agent not found: ${id}\n`),
      );
      process.exit(1);
    }

    const agentRuntimeKind = agent.modelId
      ? getAgentRuntimeKindForModel(agent.modelId)
      : "native";

    console.log(colors.header(`\n  ${icons.robot} Agent: ${agent.name}\n`));
    console.log(createAgentInfoTable({ ...agent, agentRuntimeKind }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      colors.error(`\n  ${icons.error} Failed to get agent info: ${message}\n`),
    );
    await closeDb();
    process.exit(1);
  }
}
