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
        toolNames: ["findNotes"],
        skillNames: ["agent-browser"],
      }),
    ).toEqual({
      toolNames: ["findNotes", LOAD_SKILL_TOOL_NAME],
      skillNames: ["agent-browser"],
    });
  });

  it("deduplicates loadSkill when it is already selected", () => {
    expect(
      normalizeToolNamesForSkills(
        ["findNotes", LOAD_SKILL_TOOL_NAME, LOAD_SKILL_TOOL_NAME],
        ["agent-browser"],
      ),
    ).toEqual(["findNotes", LOAD_SKILL_TOOL_NAME]);
  });

  it("reapplies loadSkill on update when skills remain enabled", () => {
    expect(
      normalizeUpdatedAgentCapabilities(
        {
          toolNames: ["findNotes", LOAD_SKILL_TOOL_NAME],
          skillNames: ["agent-browser"],
        },
        {
          toolNames: ["findNotes"],
        },
      ),
    ).toEqual({
      toolNames: ["findNotes", LOAD_SKILL_TOOL_NAME],
    });
  });

  it("removes the implicit loadSkill dependency when all skills are cleared", () => {
    expect(
      normalizeUpdatedAgentCapabilities(
        {
          toolNames: ["findNotes", LOAD_SKILL_TOOL_NAME],
          skillNames: ["agent-browser"],
        },
        {
          skillNames: [],
        },
      ),
    ).toEqual({
      toolNames: ["findNotes"],
      skillNames: [],
    });
  });
});
