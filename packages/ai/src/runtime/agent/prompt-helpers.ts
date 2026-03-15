/**
 * Prompt Building Helpers
 *
 * Reusable utilities for constructing system prompts with tool signatures,
 * skill injection, and tool prompt contributions.
 */

import { toOpenAITools } from "../../agent/tool.js";
import {
  discoverSkills,
  loadSkillContent,
} from "../../registries/skill-registry.js";
import type { RuntimeToolDefinition } from "../tools/types.js";

/**
 * Generate TypeScript-like function signatures for text-mode tool calling.
 */
export function getToolSignatures(
  tools: Record<string, RuntimeToolDefinition>,
): string {
  return toOpenAITools(tools)
    .map((tool) => {
      const params = tool.function.parameters as {
        properties?: Record<string, unknown>;
      };
      const paramStr = params.properties
        ? Object.entries(params.properties)
            .map(([name, schema]) => {
              const param = schema as { type?: string };
              return `${name}?: ${param.type || "any"}`;
            })
            .join(", ")
        : "";

      return `function ${tool.function.name}(${paramStr}): Promise<any>; // ${tool.function.description}`;
    })
    .join("\n");
}

/**
 * Collect prompt snippets and guidelines from a set of tools.
 */
export function collectToolPromptContributions(
  tools: Record<string, RuntimeToolDefinition>,
): { snippets: string[]; guidelines: string[] } {
  const snippets: string[] = [];
  const guidelines: string[] = [];

  for (const tool of Object.values(tools)) {
    if (tool.promptSnippet) {
      snippets.push(tool.promptSnippet);
    }
    if (tool.promptGuidelines) {
      guidelines.push(...tool.promptGuidelines);
    }
  }

  return { snippets, guidelines };
}

export interface AppendCapabilitiesOptions {
  skillNames?: string[];
  tools: Record<string, RuntimeToolDefinition>;
}

/**
 * Append agent capabilities (skills and tool guidelines) to a system prompt.
 *
 * Discovers skills by name, injects always-include skill content, and adds
 * tool prompt snippets and guidelines.
 */
export function appendAgentCapabilities(
  prompt: string,
  options: AppendCapabilitiesOptions,
): string {
  let result = prompt;

  const discoveredSkills = discoverSkills();
  const enabledSkills = (options.skillNames ?? [])
    .map((name) => discoveredSkills.find((skill) => skill.name === name))
    .filter((skill): skill is NonNullable<typeof skill> => !!skill);

  if (enabledSkills.length > 0) {
    result += `\n\n## Skills\nAvailable skills:\n${enabledSkills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n")}\n\nUse the loadSkill tool to load a skill's full instructions when the task matches its description.`;
  }

  for (const skill of enabledSkills) {
    if (!skill.alwaysInclude) {
      continue;
    }

    const content = loadSkillContent(skill.name);
    if (content) {
      result += `\n\n## ${skill.name}\n${content}`;
    }
  }

  const { snippets, guidelines } = collectToolPromptContributions(
    options.tools,
  );

  if (snippets.length > 0) {
    result += `\n\n${snippets.join("\n\n")}`;
  }

  if (guidelines.length > 0) {
    result += `\n\n## Tool Guidelines\n${guidelines.map((guideline) => `- ${guideline}`).join("\n")}`;
  }

  return result;
}

/**
 * Select a subset of tools by name from a tool map.
 */
export function selectTools(
  allTools: Record<string, RuntimeToolDefinition>,
  toolNames: string[],
): Record<string, RuntimeToolDefinition> {
  return Object.fromEntries(
    toolNames
      .map((name) => [name, allTools[name]] as const)
      .filter((entry): entry is [string, RuntimeToolDefinition] => !!entry[1]),
  );
}
