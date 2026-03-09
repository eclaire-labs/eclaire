/**
 * Load Skill Tool
 *
 * Lets the agent load the full content of a skill on-demand
 * for progressive disclosure.
 */

import {
  loadSkillContent,
  textResult,
  errorResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";

const inputSchema = z.object({
  name: z
    .string()
    .describe("Name of the skill to load (from the available skills list)"),
});

export const loadSkillTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "loadSkill",
  label: "Load Skill",
  description:
    "Load the full instructions of a skill by name. See the available skills list in your system prompt.",
  inputSchema,
  execute: async (_callId, input) => {
    const content = loadSkillContent(input.name);
    if (!content) {
      return errorResult(`Skill '${input.name}' not found`);
    }
    return textResult(content);
  },
};
