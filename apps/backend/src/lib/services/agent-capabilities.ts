export const LOAD_SKILL_TOOL_NAME = "loadSkill";

function uniqueNames(names: string[]): string[] {
  return Array.from(new Set(names));
}

export function normalizeToolNamesForSkills(
  toolNames: string[] = [],
  skillNames: string[] = [],
): string[] {
  const normalizedToolNames = uniqueNames(
    toolNames.filter((toolName) => toolName !== LOAD_SKILL_TOOL_NAME),
  );

  if (skillNames.length > 0) {
    normalizedToolNames.push(LOAD_SKILL_TOOL_NAME);
  }

  return normalizedToolNames;
}

export function normalizeCreateAgentCapabilities(input: {
  toolNames?: string[];
  skillNames?: string[];
}): { toolNames: string[]; skillNames: string[] } {
  const skillNames = uniqueNames(input.skillNames ?? []);
  return {
    toolNames: normalizeToolNamesForSkills(input.toolNames ?? [], skillNames),
    skillNames,
  };
}

export function normalizeUpdatedAgentCapabilities(
  current: { toolNames: string[]; skillNames: string[] },
  updates: { toolNames?: string[]; skillNames?: string[] },
): {
  toolNames?: string[];
  skillNames?: string[];
} {
  if (updates.toolNames === undefined && updates.skillNames === undefined) {
    return {};
  }

  const nextSkillNames = uniqueNames(updates.skillNames ?? current.skillNames);
  const baseToolNames = updates.toolNames ?? current.toolNames;

  return {
    toolNames: normalizeToolNamesForSkills(baseToolNames, nextSkillNames),
    ...(updates.skillNames !== undefined ? { skillNames: nextSkillNames } : {}),
  };
}
