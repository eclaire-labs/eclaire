import { describe, expect, it } from "vitest";
import {
  LOAD_SKILL_TOOL_NAME,
  normalizeCreateAgentCapabilities,
  normalizeToolNamesForSkills,
  normalizeUpdatedAgentCapabilities,
} from "../../lib/services/agent-capabilities.js";

describe("agent capability normalization", () => {
  it("adds loadSkill when creating an agent with skills", () => {
    expect(
      normalizeCreateAgentCapabilities({
        toolNames: ["findContent"],
        skillNames: ["agent-browser"],
      }),
    ).toEqual({
      toolNames: ["findContent", LOAD_SKILL_TOOL_NAME],
      skillNames: ["agent-browser"],
    });
  });

  it("deduplicates loadSkill when it is already selected", () => {
    expect(
      normalizeToolNamesForSkills(
        ["findContent", LOAD_SKILL_TOOL_NAME, LOAD_SKILL_TOOL_NAME],
        ["agent-browser"],
      ),
    ).toEqual(["findContent", LOAD_SKILL_TOOL_NAME]);
  });

  it("reapplies loadSkill on update when skills remain enabled", () => {
    expect(
      normalizeUpdatedAgentCapabilities(
        {
          toolNames: ["findContent", LOAD_SKILL_TOOL_NAME],
          skillNames: ["agent-browser"],
        },
        {
          toolNames: ["findContent"],
        },
      ),
    ).toEqual({
      toolNames: ["findContent", LOAD_SKILL_TOOL_NAME],
    });
  });

  it("removes the implicit loadSkill dependency when all skills are cleared", () => {
    expect(
      normalizeUpdatedAgentCapabilities(
        {
          toolNames: ["findContent", LOAD_SKILL_TOOL_NAME],
          skillNames: ["agent-browser"],
        },
        {
          skillNames: [],
        },
      ),
    ).toEqual({
      toolNames: ["findContent"],
      skillNames: [],
    });
  });
});
