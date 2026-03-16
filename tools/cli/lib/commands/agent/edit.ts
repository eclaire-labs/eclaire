import { getAgent, updateAgent } from "../../db/agents.js";
import { getDefaultUser } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createAgentInfoTable } from "../../ui/format.js";
import {
  getAvailableTools,
  getAvailableSkills,
} from "../../config/agent-catalog.js";
import {
  intro,
  outro,
  cancel,
  textInput,
  selectMany,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function editCommand(id: string): Promise<void> {
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

    intro(`${icons.gear} Edit Agent: ${agent.name}`);

    // Show current config
    console.log(createAgentInfoTable(agent));
    console.log();

    // Select fields to edit
    const fieldsToEdit = await selectMany<string>({
      message: "Select fields to edit",
      options: [
        { value: "name", label: "Name", hint: agent.name },
        {
          value: "description",
          label: "Description",
          hint: agent.description || "(none)",
        },
        {
          value: "systemPrompt",
          label: "System Prompt",
          hint:
            agent.systemPrompt.length > 40
              ? `${agent.systemPrompt.substring(0, 37)}...`
              : agent.systemPrompt,
        },
        {
          value: "modelId",
          label: "Model",
          hint: agent.modelId || "(system default)",
        },
        {
          value: "toolNames",
          label: "Tools",
          hint:
            agent.toolNames.length > 0 ? agent.toolNames.join(", ") : "(none)",
        },
        {
          value: "skillNames",
          label: "Skills",
          hint:
            agent.skillNames.length > 0
              ? agent.skillNames.join(", ")
              : "(none)",
        },
      ],
    });

    if (fieldsToEdit.length === 0) {
      cancel("No fields selected");
      await closeDb();
      return;
    }

    const updates: Record<string, unknown> = {};

    for (const field of fieldsToEdit) {
      if (field === "name") {
        const name = await textInput({
          message: "New name",
          defaultValue: agent.name,
          validate: (value: string) => {
            if (!value || value.trim().length === 0) {
              return "Name is required";
            }
            if (value.trim().length > 80) {
              return "Name must be 80 characters or fewer";
            }
          },
        });
        updates.name = name.trim();
      }

      if (field === "description") {
        const description = await textInput({
          message: "New description (leave empty to clear)",
          defaultValue: agent.description || "",
          validate: (value: string) => {
            if (value.length > 240) {
              return "Description must be 240 characters or fewer";
            }
          },
        });
        updates.description = description.trim() || null;
      }

      if (field === "systemPrompt") {
        const systemPrompt = await textInput({
          message: "New system prompt",
          defaultValue: agent.systemPrompt,
          validate: (value: string) => {
            if (!value || value.trim().length === 0) {
              return "System prompt is required";
            }
            if (value.length > 12000) {
              return "System prompt must be 12,000 characters or fewer";
            }
          },
        });
        updates.systemPrompt = systemPrompt.trim();
      }

      if (field === "modelId") {
        const modelId = await textInput({
          message:
            'New model ID (format: "provider:model", empty = system default)',
          defaultValue: agent.modelId || "",
          validate: (value: string) => {
            if (value.trim().length > 0 && !value.includes(":")) {
              return 'Model ID must be in "provider:model" format';
            }
          },
        });
        updates.modelId = modelId.trim() || null;
      }

      if (field === "toolNames") {
        const availableTools = await getAvailableTools();
        if (availableTools.length > 0) {
          updates.toolNames = await selectMany<string>({
            message: "Select tools to enable:",
            options: availableTools.map((t) => ({
              value: t.name,
              label: t.label,
              hint: t.hint,
            })),
            required: false,
            initialValues: agent.toolNames,
          });
        } else {
          const toolsRaw = await textInput({
            message: "Tool names (comma-separated, leave empty to clear)",
            defaultValue: agent.toolNames.join(", "),
          });
          updates.toolNames = parseCommaSeparated(toolsRaw);
        }
      }

      if (field === "skillNames") {
        const availableSkills = getAvailableSkills();
        if (availableSkills.length > 0) {
          updates.skillNames = await selectMany<string>({
            message: "Select skills to enable:",
            options: availableSkills.map((s) => ({
              value: s.name,
              label: s.label,
              hint: s.hint,
            })),
            required: false,
            initialValues: agent.skillNames,
          });
        } else {
          const skillsRaw = await textInput({
            message: "Skill names (comma-separated, leave empty to clear)",
            defaultValue: agent.skillNames.join(", "),
          });
          updates.skillNames = parseCommaSeparated(skillsRaw);
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      cancel("No changes made");
      await closeDb();
      return;
    }

    await updateAgent(id, updates as Parameters<typeof updateAgent>[1]);
    await closeDb();

    outro(
      colors.success(
        `${icons.success} Agent "${agent.name}" updated successfully!`,
      ),
    );
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      colors.error(`\n  ${icons.error} Failed to edit agent: ${message}\n`),
    );
    await closeDb();
    process.exit(1);
  }
}
