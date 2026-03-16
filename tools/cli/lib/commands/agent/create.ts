import { createAgent } from "../../db/agents.js";
import { getDefaultUser } from "../../db/users.js";
import { closeDb } from "../../db/index.js";
import { colors, icons } from "../../ui/colors.js";
import {
  getAvailableTools,
  getAvailableSkills,
} from "../../config/agent-catalog.js";
import {
  intro,
  outro,
  cancel,
  note,
  textInput,
  selectMany,
  confirm,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function createCommand(): Promise<void> {
  try {
    intro(`${icons.robot} Create Agent`);

    const user = await getDefaultUser();

    // 1. Name
    const name = await textInput({
      message: "Agent name",
      placeholder: "My Agent",
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "Name is required";
        }
        if (value.trim().length > 80) {
          return "Name must be 80 characters or fewer";
        }
      },
    });

    // 2. Description (optional)
    const description = await textInput({
      message: "Description (optional, max 240 chars)",
      placeholder: "What does this agent do?",
      validate: (value: string) => {
        if (value.length > 240) {
          return "Description must be 240 characters or fewer";
        }
      },
    });

    // 3. System Prompt
    const systemPrompt = await textInput({
      message:
        "System prompt (single line here; longer prompts can be edited later)",
      placeholder: "You are a helpful assistant...",
      validate: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "System prompt is required";
        }
        if (value.length > 12000) {
          return "System prompt must be 12,000 characters or fewer";
        }
      },
    });

    // 4. Model ID (optional)
    const modelId = await textInput({
      message:
        'Model ID (optional, format: "provider:model", empty = system default)',
      placeholder: "openrouter:google/gemini-2.0-flash-001",
      validate: (value: string) => {
        if (value.trim().length > 0 && !value.includes(":")) {
          return 'Model ID must be in "provider:model" format';
        }
      },
    });

    // 5. Tools (multi-select or fallback to text input)
    const availableTools = await getAvailableTools();
    let toolNames: string[] = [];
    if (availableTools.length > 0) {
      toolNames = await selectMany<string>({
        message: "Select tools to enable:",
        options: availableTools.map((t) => ({
          value: t.name,
          label: t.label,
          hint: t.hint,
        })),
        required: false,
      });
    } else {
      const toolsRaw = await textInput({
        message: "Tool names (comma-separated, optional)",
        placeholder: "web_search, calculator",
      });
      toolNames = parseCommaSeparated(toolsRaw);
    }

    // 6. Skills (multi-select or fallback to text input)
    const availableSkills = getAvailableSkills();
    let skillNames: string[] = [];
    if (availableSkills.length > 0) {
      skillNames = await selectMany<string>({
        message: "Select skills to enable:",
        options: availableSkills.map((s) => ({
          value: s.name,
          label: s.label,
          hint: s.hint,
        })),
        required: false,
      });
    } else {
      const skillsRaw = await textInput({
        message: "Skill names (comma-separated, optional)",
        placeholder: "summarize, translate",
      });
      skillNames = parseCommaSeparated(skillsRaw);
    }

    // 7. Summary
    const summaryLines = [
      `Name:          ${name}`,
      `Description:   ${description || "(none)"}`,
      `System Prompt: ${systemPrompt.length > 80 ? `${systemPrompt.substring(0, 77)}...` : systemPrompt}`,
      `Model:         ${modelId.trim() || "(system default)"}`,
      `Tools:         ${toolNames.length > 0 ? toolNames.join(", ") : "(none)"}`,
      `Skills:        ${skillNames.length > 0 ? skillNames.join(", ") : "(none)"}`,
    ].join("\n");

    note(summaryLines, "New Agent");

    // 8. Confirm
    const proceed = await confirm({
      message: "Create this agent?",
      initialValue: true,
    });

    if (!proceed) {
      cancel("Cancelled");
      await closeDb();
      return;
    }

    // 9. Insert
    const agent = await createAgent({
      userId: user.id,
      name: name.trim(),
      description: description.trim() || null,
      systemPrompt: systemPrompt.trim(),
      toolNames,
      skillNames,
      modelId: modelId.trim() || null,
    });
    await closeDb();

    outro(
      colors.success(
        `${icons.success} Agent "${agent.name}" created successfully! (${agent.id})`,
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
      colors.error(`\n  ${icons.error} Failed to create agent: ${message}\n`),
    );
    await closeDb();
    process.exit(1);
  }
}
