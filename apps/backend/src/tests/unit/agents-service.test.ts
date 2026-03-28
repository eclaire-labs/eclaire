/**
 * Agent Service Unit Tests
 *
 * Tests the CRUD functions and validators in lib/services/agents.ts.
 * All DB access is mocked — these are pure unit tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks (referenced inside vi.mock factories)
// ---------------------------------------------------------------------------

const mockTools = vi.hoisted(() => ({
  findContent: {
    name: "findContent",
    label: "Find Content",
    description: "Search content",
    inputSchema: {} as never,
    accessLevel: "read" as const,
    visibility: "all" as const,
    needsApproval: false,
    execute: vi.fn(),
  },
  sendEmail: {
    name: "sendEmail",
    label: "Send Email",
    description: "Send an email",
    inputSchema: {} as never,
    accessLevel: "write" as const,
    visibility: "all" as const,
    needsApproval: true,
    execute: vi.fn(),
  },
  browseWeb: {
    name: "browseWeb",
    label: "Browse Web",
    description: "Browse the web",
    inputSchema: {} as never,
    accessLevel: "write" as const,
    visibility: "all" as const,
    needsApproval: false,
    execute: vi.fn(),
  },
}));

const mockSkills = vi.hoisted(() => [
  {
    name: "coding-assistant",
    description: "Coding helper",
    filePath: "/skills/coding.md",
    baseDir: "/skills",
    scope: "workspace" as const,
    alwaysInclude: false,
    tags: ["dev"],
  },
  {
    name: "writing-helper",
    description: "Writing helper",
    filePath: "/skills/writing.md",
    baseDir: "/skills",
    scope: "user" as const,
    alwaysInclude: true,
    tags: ["writing"],
  },
]);

const mcpRegistryMock = vi.hoisted(() => ({
  getMcpTools: vi.fn(() => ({})),
  getToolAvailability: vi.fn(() => undefined),
}));

const aiMocks = vi.hoisted(() => ({
  discoverSkills: vi.fn(() => mockSkills),
  getSkill: vi.fn((name: string) => mockSkills.find((s) => s.name === name)),
  loadSkillContent: vi.fn((name: string) => {
    if (name === "coding-assistant")
      return "# Coding Assistant\nHelps with code.";
    if (name === "writing-helper")
      return "# Writing Helper\nHelps with writing.";
    return undefined;
  }),
  isValidModelIdFormat: vi.fn((id: string) => {
    if (!id || typeof id !== "string") return false;
    const colonIndex = id.indexOf(":");
    return colonIndex > 0 && colonIndex < id.length - 1;
  }),
  getModelConfigById: vi.fn((modelId: string) => {
    if (modelId === "anthropic:claude-3")
      return { provider: "anthropic", model: "claude-3" };
    if (modelId === "external:harness-model")
      return { provider: "external", model: "harness-model" };
    return null;
  }),
  resolveProviderForModel: vi.fn((_modelId: string, _config: unknown) => ({
    providerConfig: {},
    url: "https://api.example.com",
  })),
  getAgentRuntimeKindForModel: vi.fn((modelId: string) => {
    if (modelId === "external:harness-model") return "external_harness";
    return "native";
  }),
  normalizeCreateAgentCapabilities: vi.fn(
    (input: { toolNames?: string[]; skillNames?: string[] }) => ({
      toolNames: input.toolNames ?? [],
      skillNames: input.skillNames ?? [],
    }),
  ),
  normalizeUpdatedAgentCapabilities: vi.fn(
    (
      _current: { toolNames: string[]; skillNames: string[] },
      updates: { toolNames?: string[]; skillNames?: string[] },
    ) => {
      const result: { toolNames?: string[]; skillNames?: string[] } = {};
      if (updates.toolNames !== undefined) result.toolNames = updates.toolNames;
      if (updates.skillNames !== undefined)
        result.skillNames = updates.skillNames;
      return result;
    },
  ),
}));

// ---------------------------------------------------------------------------
// DB mock — fluent query builder
// ---------------------------------------------------------------------------

/**
 * Creates a chainable mock for Drizzle select/insert/update/delete.
 * The terminal `returning()` or the final chain call resolves `rows`.
 */
function createChain(rows: () => Record<string, unknown>[]) {
  // biome-ignore lint/suspicious/noExplicitAny: mock chain uses symbol keys and thenable patterns
  const chain: Record<string | symbol, any> = {};
  const self = () => chain;
  for (const m of [
    "select",
    "from",
    "where",
    "orderBy",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "delete",
    "onConflictDoUpdate",
  ]) {
    chain[m] = vi.fn(self);
  }
  // `select().from().where()` should resolve to rows (for Drizzle-style await)
  chain[Symbol.iterator] = function* () {
    yield* rows();
  };
  // Make the chain thenable so `await db.select().from()...` works
  // biome-ignore lint/suspicious/noThenProperty: required for Drizzle-style promise chain mock
  chain.then = (
    resolve: (v: unknown) => void,
    _reject?: (e: unknown) => void,
  ) => {
    resolve(rows());
  };
  return chain;
}

const dbMock = vi.hoisted(() => {
  const selectRows: { current: Record<string, unknown>[] } = { current: [] };
  const insertRows: { current: Record<string, unknown>[] } = { current: [] };
  const updateRows: { current: Record<string, unknown>[] } = { current: [] };
  const deleteRows: { current: Record<string, unknown>[] } = { current: [] };

  const selectChain = createChain(() => selectRows.current);
  const insertChain = createChain(() => insertRows.current);
  const updateChain = createChain(() => updateRows.current);
  const deleteChain = createChain(() => deleteRows.current);

  return {
    selectRows,
    insertRows,
    updateRows,
    deleteRows,
    selectChain,
    insertChain,
    updateChain,
    deleteChain,
    db: {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
      update: vi.fn(() => updateChain),
      delete: vi.fn(() => deleteChain),
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        // The transaction callback receives a tx that looks like db
        const txInsertChain = createChain(() => insertRows.current);
        const txDeleteChain = createChain(() => deleteRows.current);
        const tx = {
          insert: vi.fn(() => txInsertChain),
          delete: vi.fn(() => txDeleteChain),
        };
        return fn(tx);
      }),
    },
    schema: {
      agents: Symbol("agents"),
      actors: Symbol("actors"),
    },
  };
});

// ---------------------------------------------------------------------------
// vi.mock calls
// ---------------------------------------------------------------------------

vi.mock("../../db/index.js", () => ({
  db: dbMock.db,
  schema: dbMock.schema,
}));

vi.mock("../../lib/agent/tools/index.js", () => ({
  getBackendTools: () => mockTools,
}));

vi.mock("../../lib/mcp/index.js", () => ({
  getMcpRegistry: () => mcpRegistryMock,
}));

vi.mock("@eclaire/ai", () => ({
  discoverSkills: aiMocks.discoverSkills,
  getSkill: aiMocks.getSkill,
  loadSkillContent: aiMocks.loadSkillContent,
  isValidModelIdFormat: aiMocks.isValidModelIdFormat,
  getModelConfigById: aiMocks.getModelConfigById,
  resolveProviderForModel: aiMocks.resolveProviderForModel,
  getAgentRuntimeKindForModel: aiMocks.getAgentRuntimeKindForModel,
  normalizeCreateAgentCapabilities: aiMocks.normalizeCreateAgentCapabilities,
  normalizeUpdatedAgentCapabilities: aiMocks.normalizeUpdatedAgentCapabilities,
  LOAD_SKILL_TOOL_NAME: "loadSkill",
}));

vi.mock("../../lib/services/agent-capabilities.js", () => ({
  normalizeCreateAgentCapabilities: aiMocks.normalizeCreateAgentCapabilities,
  normalizeUpdatedAgentCapabilities: aiMocks.normalizeUpdatedAgentCapabilities,
  LOAD_SKILL_TOOL_NAME: "loadSkill",
  normalizeToolNamesForSkills: vi.fn((tools: string[]) => tools),
}));

vi.mock("../../lib/services/actors.js", () => ({
  updateAgentActorDisplayName: vi.fn(async () => {}),
}));

vi.mock("../../lib/services/history.js", () => ({
  recordHistory: vi.fn(async () => {}),
}));

vi.mock("../../lib/services/actor-constants.js", () => ({
  DEFAULT_AGENT_ACTOR_ID: "eclaire",
  DEFAULT_AGENT_ACTOR_NAME: "Eclaire",
}));

vi.mock("../../lib/logger.js", () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import the module under test (AFTER all vi.mock calls)
// ---------------------------------------------------------------------------

import {
  createAgent,
  deleteAgent,
  getAgent,
  getAgentCatalog,
  getDefaultAgentDefinition,
  getSkillDetail,
  listAgents,
  updateAgent,
  DEFAULT_AGENT_ID,
} from "../../lib/services/agents.js";

import { NotFoundError, ValidationError } from "../../lib/errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER = "user-abc-123";

function makeAgentRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "agent-001",
    userId: TEST_USER,
    name: "My Agent",
    description: "A test agent",
    systemPrompt: "You are helpful.",
    toolNames: ["findContent"],
    skillNames: [],
    modelId: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-02"),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.selectRows.current = [];
  dbMock.insertRows.current = [];
  dbMock.updateRows.current = [];
  dbMock.deleteRows.current = [];
});

// ==========================================================================
// getDefaultAgentDefinition
// ==========================================================================

describe("getDefaultAgentDefinition", () => {
  it("returns a builtin agent with expected shape", () => {
    const def = getDefaultAgentDefinition();

    expect(def.id).toBe("eclaire");
    expect(def.kind).toBe("builtin");
    expect(def.name).toBe("Eclaire");
    expect(def.isEditable).toBe(false);
    expect(def.modelId).toBeNull();
    expect(def.systemPrompt).toContain("Eclaire");
  });

  it("includes all tools except those disabled by default", () => {
    const def = getDefaultAgentDefinition();

    expect(def.toolNames).toContain("findContent");
    expect(def.toolNames).toContain("sendEmail");
    expect(def.toolNames).not.toContain("browseWeb");
  });

  it("includes all discovered skills", () => {
    const def = getDefaultAgentDefinition();

    expect(def.skillNames).toContain("coding-assistant");
    expect(def.skillNames).toContain("writing-helper");
  });
});

// ==========================================================================
// getAgentCatalog
// ==========================================================================

describe("getAgentCatalog", () => {
  it("returns tools and skills arrays", () => {
    const catalog = getAgentCatalog();

    expect(Array.isArray(catalog.tools)).toBe(true);
    expect(Array.isArray(catalog.skills)).toBe(true);
  });

  it("contains the expected tools sorted by label", () => {
    const catalog = getAgentCatalog();
    const toolNames = catalog.tools.map((t) => t.name);

    expect(toolNames).toContain("findContent");
    expect(toolNames).toContain("sendEmail");
    expect(toolNames).toContain("browseWeb");

    // Verify sorted by label
    const labels = catalog.tools.map((t) => t.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });

  it("contains the expected skills sorted by name", () => {
    const catalog = getAgentCatalog();
    const skillNames = catalog.skills.map((s) => s.name);

    expect(skillNames).toContain("coding-assistant");
    expect(skillNames).toContain("writing-helper");

    const sorted = [...skillNames].sort((a, b) => a.localeCompare(b));
    expect(skillNames).toEqual(sorted);
  });

  it("populates tool metadata fields", () => {
    const catalog = getAgentCatalog();
    const email = catalog.tools.find((t) => t.name === "sendEmail");

    expect(email).toBeDefined();
    expect(email!.label).toBe("Send Email");
    expect(email!.description).toBe("Send an email");
    expect(email!.accessLevel).toBe("write");
    expect(email!.needsApproval).toBe(true);
  });
});

// ==========================================================================
// getSkillDetail
// ==========================================================================

describe("getSkillDetail", () => {
  it("returns skill content for a known skill", () => {
    const detail = getSkillDetail("coding-assistant");

    expect(detail.name).toBe("coding-assistant");
    expect(detail.description).toBe("Coding helper");
    expect(detail.content).toContain("Coding Assistant");
    expect(detail.scope).toBe("workspace");
    expect(detail.alwaysInclude).toBe(false);
    expect(detail.tags).toEqual(["dev"]);
  });

  it("throws NotFoundError for an unknown skill", () => {
    aiMocks.getSkill.mockReturnValueOnce(undefined);

    expect(() => getSkillDetail("nonexistent")).toThrow(NotFoundError);
  });
});

// ==========================================================================
// listAgents
// ==========================================================================

describe("listAgents", () => {
  it("returns default agent first followed by custom agents", async () => {
    const customRow = makeAgentRow();
    dbMock.selectRows.current = [customRow];

    const agents = await listAgents(TEST_USER);

    expect(agents.length).toBe(2);
    expect(agents[0]!.id).toBe("eclaire");
    expect(agents[0]!.kind).toBe("builtin");
    expect(agents[1]!.id).toBe("agent-001");
    expect(agents[1]!.kind).toBe("custom");
  });

  it("returns only the default agent when user has no custom agents", async () => {
    dbMock.selectRows.current = [];

    const agents = await listAgents(TEST_USER);

    expect(agents.length).toBe(1);
    expect(agents[0]!.id).toBe("eclaire");
  });
});

// ==========================================================================
// getAgent
// ==========================================================================

describe("getAgent", () => {
  it("returns the default agent definition for the default agent ID", async () => {
    const agent = await getAgent(TEST_USER, DEFAULT_AGENT_ID);

    expect(agent.id).toBe("eclaire");
    expect(agent.kind).toBe("builtin");
    expect(agent.isEditable).toBe(false);
    // Should not hit the DB
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });

  it("returns a custom agent for a valid agent + user", async () => {
    const row = makeAgentRow();
    dbMock.selectRows.current = [row];

    const agent = await getAgent(TEST_USER, "agent-001");

    expect(agent.id).toBe("agent-001");
    expect(agent.kind).toBe("custom");
    expect(agent.isEditable).toBe(true);
    expect(agent.name).toBe("My Agent");
  });

  it("throws NotFoundError when agent does not exist", async () => {
    dbMock.selectRows.current = [];

    await expect(getAgent(TEST_USER, "agent-missing")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws NotFoundError when agent belongs to a different user", async () => {
    // DB returns empty because the where clause filters by userId
    dbMock.selectRows.current = [];

    await expect(getAgent("other-user", "agent-001")).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ==========================================================================
// createAgent — happy path
// ==========================================================================

describe("createAgent", () => {
  it("creates an agent and returns a normalized definition", async () => {
    const insertedRow = makeAgentRow({
      id: "agent-new",
      name: "New Agent",
      systemPrompt: "Be helpful.",
    });
    dbMock.insertRows.current = [insertedRow];

    const result = await createAgent(TEST_USER, {
      name: "  New Agent  ",
      systemPrompt: "  Be helpful.  ",
      toolNames: ["findContent"],
      skillNames: [],
    });

    expect(result.id).toBe("agent-new");
    expect(result.kind).toBe("custom");
    expect(result.isEditable).toBe(true);
  });

  it("calls normalizeCreateAgentCapabilities with the input", async () => {
    dbMock.insertRows.current = [makeAgentRow()];

    await createAgent(TEST_USER, {
      name: "Agent",
      systemPrompt: "Prompt",
      toolNames: ["findContent"],
      skillNames: ["coding-assistant"],
    });

    expect(aiMocks.normalizeCreateAgentCapabilities).toHaveBeenCalledWith({
      name: "Agent",
      systemPrompt: "Prompt",
      toolNames: ["findContent"],
      skillNames: ["coding-assistant"],
    });
  });
});

// ==========================================================================
// createAgent — validation: model ID
// ==========================================================================

describe("createAgent — model validation", () => {
  it("rejects an invalid model ID format", async () => {
    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        modelId: "no-colon",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects a non-existent model", async () => {
    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        modelId: "unknown:model-xyz",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts a valid model ID", async () => {
    dbMock.insertRows.current = [
      makeAgentRow({ modelId: "anthropic:claude-3" }),
    ];

    const result = await createAgent(TEST_USER, {
      name: "Agent",
      systemPrompt: "Prompt",
      modelId: "anthropic:claude-3",
    });

    expect(result.modelId).toBe("anthropic:claude-3");
  });

  it("accepts null modelId without validation", async () => {
    dbMock.insertRows.current = [makeAgentRow()];

    // Should not throw — null means use the default model
    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        modelId: null,
      }),
    ).resolves.toBeDefined();
  });
});

// ==========================================================================
// createAgent — validation: capabilities
// ==========================================================================

describe("createAgent — capability validation", () => {
  it("rejects an unknown tool name", async () => {
    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        toolNames: ["nonexistentTool"],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an unknown skill name", async () => {
    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        skillNames: ["nonexistent-skill"],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts valid tool and skill names", async () => {
    dbMock.insertRows.current = [
      makeAgentRow({
        toolNames: ["findContent"],
        skillNames: ["coding-assistant"],
      }),
    ];

    const result = await createAgent(TEST_USER, {
      name: "Agent",
      systemPrompt: "Prompt",
      toolNames: ["findContent"],
      skillNames: ["coding-assistant"],
    });

    expect(result.toolNames).toEqual(["findContent"]);
    expect(result.skillNames).toEqual(["coding-assistant"]);
  });
});

// ==========================================================================
// createAgent — validation: runtime capability policy
// ==========================================================================

describe("createAgent — runtime capability policy", () => {
  it("rejects external harness model with tools", async () => {
    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        modelId: "external:harness-model",
        toolNames: ["findContent"],
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        modelId: "external:harness-model",
        toolNames: ["findContent"],
      }),
    ).rejects.toThrow(/tools/i);
  });

  it("rejects external harness model with skills", async () => {
    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        modelId: "external:harness-model",
        skillNames: ["coding-assistant"],
      }),
    ).rejects.toThrow(ValidationError);

    await expect(
      createAgent(TEST_USER, {
        name: "Agent",
        systemPrompt: "Prompt",
        modelId: "external:harness-model",
        skillNames: ["coding-assistant"],
      }),
    ).rejects.toThrow(/skills/i);
  });

  it("allows native model with tools", async () => {
    dbMock.insertRows.current = [
      makeAgentRow({
        modelId: "anthropic:claude-3",
        toolNames: ["findContent"],
      }),
    ];

    const result = await createAgent(TEST_USER, {
      name: "Agent",
      systemPrompt: "Prompt",
      modelId: "anthropic:claude-3",
      toolNames: ["findContent"],
    });

    expect(result.modelId).toBe("anthropic:claude-3");
    expect(result.toolNames).toEqual(["findContent"]);
  });

  it("allows external harness model with no tools and no skills", async () => {
    dbMock.insertRows.current = [
      makeAgentRow({
        modelId: "external:harness-model",
        toolNames: [],
        skillNames: [],
      }),
    ];

    const result = await createAgent(TEST_USER, {
      name: "Agent",
      systemPrompt: "Prompt",
      modelId: "external:harness-model",
      toolNames: [],
      skillNames: [],
    });

    expect(result.modelId).toBe("external:harness-model");
  });
});

// ==========================================================================
// updateAgent
// ==========================================================================

describe("updateAgent", () => {
  it("updates agent fields and returns the normalized result", async () => {
    // getAgent lookup
    const existing = makeAgentRow();
    dbMock.selectRows.current = [existing];
    // update returning
    const updated = makeAgentRow({
      name: "Updated Name",
      updatedAt: new Date("2025-06-01"),
    });
    dbMock.updateRows.current = [updated];

    const result = await updateAgent(TEST_USER, "agent-001", {
      name: "Updated Name",
    });

    expect(result.name).toBe("Updated Name");
    expect(result.kind).toBe("custom");
    expect(result.isEditable).toBe(true);
  });

  it("rejects updates to the default agent", async () => {
    await expect(
      updateAgent(TEST_USER, DEFAULT_AGENT_ID, { name: "Hacked" }),
    ).rejects.toThrow(ValidationError);

    await expect(
      updateAgent(TEST_USER, DEFAULT_AGENT_ID, { name: "Hacked" }),
    ).rejects.toThrow(/read-only/i);
  });

  it("throws NotFoundError for a non-existent agent", async () => {
    // getAgent lookup returns nothing
    dbMock.selectRows.current = [];

    await expect(
      updateAgent(TEST_USER, "agent-missing", { name: "Nope" }),
    ).rejects.toThrow(NotFoundError);
  });

  it("validates model ID when modelId is in updates", async () => {
    dbMock.selectRows.current = [makeAgentRow()];

    await expect(
      updateAgent(TEST_USER, "agent-001", { modelId: "bad-format" }),
    ).rejects.toThrow(ValidationError);
  });

  it("does not validate model ID when modelId is not in updates", async () => {
    const existing = makeAgentRow();
    dbMock.selectRows.current = [existing];
    dbMock.updateRows.current = [existing];

    // Should not throw even though existing modelId is null
    await expect(
      updateAgent(TEST_USER, "agent-001", { name: "Renamed" }),
    ).resolves.toBeDefined();
  });

  it("rejects update that would give external harness model tools", async () => {
    const existing = makeAgentRow({
      modelId: "external:harness-model",
      toolNames: [],
      skillNames: [],
    });
    dbMock.selectRows.current = [existing];

    await expect(
      updateAgent(TEST_USER, "agent-001", { toolNames: ["findContent"] }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects switching to external harness model when agent has tools", async () => {
    const existing = makeAgentRow({ toolNames: ["findContent"] });
    dbMock.selectRows.current = [existing];

    await expect(
      updateAgent(TEST_USER, "agent-001", {
        modelId: "external:harness-model",
      }),
    ).rejects.toThrow(ValidationError);
  });
});

// ==========================================================================
// deleteAgent
// ==========================================================================

describe("deleteAgent", () => {
  it("deletes an agent via transaction", async () => {
    dbMock.deleteRows.current = [makeAgentRow()];

    await expect(deleteAgent(TEST_USER, "agent-001")).resolves.toBeUndefined();
    expect(dbMock.db.transaction).toHaveBeenCalled();
  });

  it("rejects deleting the default agent", async () => {
    await expect(deleteAgent(TEST_USER, DEFAULT_AGENT_ID)).rejects.toThrow(
      ValidationError,
    );

    await expect(deleteAgent(TEST_USER, DEFAULT_AGENT_ID)).rejects.toThrow(
      /cannot be deleted/i,
    );
  });

  it("throws NotFoundError when agent does not exist", async () => {
    dbMock.deleteRows.current = [];

    await expect(deleteAgent(TEST_USER, "agent-missing")).rejects.toThrow(
      NotFoundError,
    );
  });
});

// ==========================================================================
// normalizeAgentRecord
// ==========================================================================

describe("normalizeAgentRecord (via getAgent)", () => {
  it("preserves tools and skills for native model agents", async () => {
    const row = makeAgentRow({
      modelId: "anthropic:claude-3",
      toolNames: ["findContent"],
      skillNames: ["coding-assistant"],
    });
    dbMock.selectRows.current = [row];

    const agent = await getAgent(TEST_USER, "agent-001");

    expect(agent.toolNames).toEqual(["findContent"]);
    expect(agent.skillNames).toEqual(["coding-assistant"]);
  });

  it("preserves tools and skills when modelId is null", async () => {
    const row = makeAgentRow({
      modelId: null,
      toolNames: ["sendEmail"],
      skillNames: ["writing-helper"],
    });
    dbMock.selectRows.current = [row];

    const agent = await getAgent(TEST_USER, "agent-001");

    expect(agent.toolNames).toEqual(["sendEmail"]);
    expect(agent.skillNames).toEqual(["writing-helper"]);
  });

  it("handles non-array toolNames/skillNames gracefully", async () => {
    const row = makeAgentRow({
      toolNames: null,
      skillNames: undefined,
    });
    dbMock.selectRows.current = [row];

    const agent = await getAgent(TEST_USER, "agent-001");

    expect(agent.toolNames).toEqual([]);
    expect(agent.skillNames).toEqual([]);
  });
});
