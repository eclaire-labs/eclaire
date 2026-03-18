import { describe, expect, it } from "vitest";
import {
  BUILTIN_COMMANDS,
  buildSkillScaffold,
  buildSlashItems,
  filterSlashItems,
  generateHelpText,
  getChannelAliases,
  groupSlashItems,
  parseSlashInput,
  type SlashContext,
  type SlashItem,
} from "../slash.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<SlashContext> = {}): SlashContext {
  return {
    activeAgentId: "eclaire",
    agents: [
      { id: "eclaire", name: "Eclaire", skillNames: ["research", "summarize"] },
      { id: "coder", name: "Coder", skillNames: ["code-review"] },
    ],
    surface: "web",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildSlashItems
// ---------------------------------------------------------------------------

describe("buildSlashItems", () => {
  it("includes builtin commands for the web surface", () => {
    const items = buildSlashItems(makeCtx());
    const commandIds = items
      .filter((i) => i.kind === "command")
      .map((i) => i.id);
    expect(commandIds).toContain("new");
    expect(commandIds).toContain("help");
    // "exit" is CLI-only
    expect(commandIds).not.toContain("exit");
  });

  it("includes exit command for CLI surface", () => {
    const items = buildSlashItems(makeCtx({ surface: "cli" }));
    const commandIds = items
      .filter((i) => i.kind === "command")
      .map((i) => i.id);
    expect(commandIds).toContain("exit");
  });

  it("includes agent-switch items excluding the active agent", () => {
    const items = buildSlashItems(makeCtx());
    const agentItems = items.filter((i) => i.kind === "agent");
    expect(agentItems).toHaveLength(1);
    expect(agentItems[0]!.id).toBe("coder");
  });

  it("includes skill items for the active agent only", () => {
    const items = buildSlashItems(makeCtx());
    const skillItems = items.filter((i) => i.kind === "skill");
    expect(skillItems.map((s) => s.id)).toEqual(["research", "summarize"]);
  });

  it("shows different skills when active agent changes", () => {
    const items = buildSlashItems(makeCtx({ activeAgentId: "coder" }));
    const skillItems = items.filter((i) => i.kind === "skill");
    expect(skillItems.map((s) => s.id)).toEqual(["code-review"]);
  });

  it("returns empty skills when active agent has none", () => {
    const items = buildSlashItems(
      makeCtx({
        agents: [{ id: "bare", name: "Bare", skillNames: [] }],
        activeAgentId: "bare",
      }),
    );
    const skillItems = items.filter((i) => i.kind === "skill");
    expect(skillItems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// filterSlashItems
// ---------------------------------------------------------------------------

describe("filterSlashItems", () => {
  const items = buildSlashItems(makeCtx());

  it("returns all items for empty query", () => {
    expect(filterSlashItems(items, "")).toEqual(items);
  });

  it("filters by prefix on id", () => {
    const result = filterSlashItems(items, "ne");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.id).toBe("new");
  });

  it("filters by prefix on label (case-insensitive)", () => {
    const result = filterSlashItems(items, "Cod");
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.id).toBe("coder");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterSlashItems(items, "zzz")).toEqual([]);
  });

  it("groups results: commands before agents before skills", () => {
    // "re" could match "research" (skill) — verify ordering
    const allItems: SlashItem[] = [
      { kind: "skill", id: "research", label: "research", description: "d" },
      { kind: "command", id: "reset", label: "reset", description: "d" },
      { kind: "agent", id: "rex", label: "Rex", description: "d" },
    ];
    const result = filterSlashItems(allItems, "re");
    expect(result.map((r) => r.kind)).toEqual(["command", "agent", "skill"]);
  });
});

// ---------------------------------------------------------------------------
// groupSlashItems
// ---------------------------------------------------------------------------

describe("groupSlashItems", () => {
  it("groups items by kind in order", () => {
    const items = buildSlashItems(makeCtx());
    const groups = groupSlashItems(items);
    const kinds = groups.map((g) => g.kind);
    expect(kinds).toEqual(["command", "agent", "skill"]);
  });

  it("omits empty groups", () => {
    const items = BUILTIN_COMMANDS.filter((c) => !c.surfaces);
    const groups = groupSlashItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("command");
  });
});

// ---------------------------------------------------------------------------
// parseSlashInput
// ---------------------------------------------------------------------------

describe("parseSlashInput", () => {
  const ctx = makeCtx();

  it("returns null for non-slash input", () => {
    expect(parseSlashInput("hello world", ctx)).toBeNull();
  });

  it("parses builtin command without args", () => {
    const result = parseSlashInput("/new", ctx);
    expect(result).toEqual({
      type: "execute-command",
      commandId: "new",
      args: "",
    });
  });

  it("parses builtin command with args", () => {
    const result = parseSlashInput("/history 10", ctx);
    expect(result).toEqual({
      type: "execute-command",
      commandId: "history",
      args: "10",
    });
  });

  it("is case-insensitive for commands", () => {
    const result = parseSlashInput("/NEW", ctx);
    expect(result).toEqual({
      type: "execute-command",
      commandId: "new",
      args: "",
    });
  });

  it("parses /agent with a valid name", () => {
    const result = parseSlashInput("/agent Coder", ctx);
    expect(result).toEqual({
      type: "switch-agent",
      agentId: "coder",
      agentName: "Coder",
    });
  });

  it("parses /agent with agent id", () => {
    const result = parseSlashInput("/agent coder", ctx);
    expect(result).toEqual({
      type: "switch-agent",
      agentId: "coder",
      agentName: "Coder",
    });
  });

  it("returns error for /agent with no name", () => {
    const result = parseSlashInput("/agent", ctx);
    expect(result?.type).toBe("error");
  });

  it("returns error for /agent with unknown name", () => {
    const result = parseSlashInput("/agent unknown", ctx);
    expect(result?.type).toBe("error");
    expect((result as { type: "error"; message: string }).message).toContain(
      "Unknown agent",
    );
  });

  it("parses /skill with name and task", () => {
    const result = parseSlashInput("/skill research find recent papers", ctx);
    expect(result).toEqual({
      type: "send-rewritten",
      text: 'Use the "research" skill to: find recent papers',
    });
  });

  it("parses /skill with name only as scaffold insert", () => {
    const result = parseSlashInput("/skill research", ctx);
    expect(result).toEqual({
      type: "insert-scaffold",
      text: "/skill research ",
    });
  });

  it("returns error for /skill with no name", () => {
    const result = parseSlashInput("/skill", ctx);
    expect(result?.type).toBe("error");
  });

  it("returns error for /skill with unknown skill name", () => {
    const result = parseSlashInput("/skill unknown do something", ctx);
    expect(result?.type).toBe("error");
    expect((result as { type: "error"; message: string }).message).toContain(
      "Unknown skill",
    );
  });

  it("resolves direct agent name as /agent shortcut", () => {
    const result = parseSlashInput("/coder", ctx);
    expect(result).toEqual({
      type: "switch-agent",
      agentId: "coder",
      agentName: "Coder",
    });
  });

  it("resolves direct skill name as /skill shortcut", () => {
    const result = parseSlashInput("/research find stuff", ctx);
    expect(result).toEqual({
      type: "send-rewritten",
      text: 'Use the "research" skill to: find stuff',
    });
  });

  it("returns error for completely unknown command", () => {
    const result = parseSlashInput("/zzz", ctx);
    expect(result).toEqual({
      type: "error",
      message: "Unknown command: /zzz",
    });
  });

  it("handles leading whitespace", () => {
    const result = parseSlashInput("  /new", ctx);
    expect(result?.type).toBe("execute-command");
  });
});

// ---------------------------------------------------------------------------
// buildSkillScaffold
// ---------------------------------------------------------------------------

describe("buildSkillScaffold", () => {
  it("formats scaffold correctly", () => {
    expect(buildSkillScaffold("research", "find papers")).toBe(
      'Use the "research" skill to: find papers',
    );
  });
});

// ---------------------------------------------------------------------------
// Channel helpers
// ---------------------------------------------------------------------------

describe("getChannelAliases", () => {
  it("maps eclaire-prefixed names to canonical ids", () => {
    const aliases = getChannelAliases();
    expect(aliases.get("eclaire-help")).toBe("help");
    expect(aliases.get("eclaire-new")).toBe("new");
    expect(aliases.get("eclaire-clear")).toBe("clear");
    expect(aliases.get("eclaire-settings")).toBe("thinking");
  });

  it("returns a map with all expected entries", () => {
    const aliases = getChannelAliases();
    expect(aliases.size).toBe(6);
  });
});

describe("generateHelpText", () => {
  it("generates formatted help text with groups", () => {
    const items = buildSlashItems(makeCtx());
    const text = generateHelpText(items);
    expect(text).toContain("Commands:");
    expect(text).toContain("/new");
    expect(text).toContain("Agents:");
    expect(text).toContain("Skills:");
  });

  it("applies prefix to command names", () => {
    const items: SlashItem[] = [
      { kind: "command", id: "help", label: "help", description: "Show help" },
    ];
    const text = generateHelpText(items, "eclaire-");
    expect(text).toContain("/eclaire-help");
  });

  it("omits empty groups", () => {
    const items: SlashItem[] = [
      { kind: "command", id: "help", label: "help", description: "Show help" },
    ];
    const text = generateHelpText(items);
    expect(text).not.toContain("Agents:");
    expect(text).not.toContain("Skills:");
  });
});
