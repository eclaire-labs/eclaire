/**
 * Runtime v2 Tests
 *
 * Tests for the new message model, registries, convert-to-LLM boundary,
 * and skill system.
 */

import { describe, expect, it, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";

// Message model
import {
  getTextContent,
  getToolCalls,
  getThinkingContent,
  userMessage,
  systemMessage,
  type AssistantMessage,
  type ToolResultMessage,
  type RuntimeMessage,
} from "../runtime/messages.js";

// Convert to/from LLM
import { convertToLlm } from "../runtime/agent/convert-to-llm.js";
import { convertFromLlm } from "../runtime/agent/convert-from-llm.js";
import type { AIMessage } from "../types.js";

// Tool types
import {
  textResult,
  errorResult,
  type RuntimeToolDefinition,
} from "../runtime/tools/types.js";

// Registries
import {
  registerProvider,
  getProvider,
  listProviders,
  unregisterProvider,
  clearProviders,
  getAdapterByDialect,
} from "../registries/provider-registry.js";

import {
  registerTool,
  getTool,
  getActiveTools,
  setActiveTools,
  listTools,
  unregisterTool,
  getPromptContributions,
  clearTools,
} from "../registries/tool-registry.js";

import {
  registerSkillSource,
  discoverSkills,
  getSkill,
  getSkillSummary,
  loadSkillContent,
  clearSkillSources,
} from "../registries/skill-registry.js";

import { createTempDir } from "./setup.js";

// =============================================================================
// MESSAGE MODEL TESTS
// =============================================================================

describe("Message Model", () => {
  it("creates user messages", () => {
    const msg = userMessage("hello");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("hello");
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it("creates system messages", () => {
    const msg = systemMessage("You are helpful.");
    expect(msg.role).toBe("system");
    expect(msg.content).toBe("You are helpful.");
  });

  it("extracts text from user message (string)", () => {
    const msg = userMessage("hello");
    expect(getTextContent(msg)).toBe("hello");
  });

  it("extracts text from user message (blocks)", () => {
    const msg = userMessage("hello");
    // Override with content blocks
    (msg as any).content = [
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
    ];
    expect(getTextContent(msg)).toBe("hello world");
  });

  it("extracts text from assistant message", () => {
    const msg: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "thinking", text: "let me think..." },
        { type: "text", text: "The answer is 42." },
      ],
    };
    expect(getTextContent(msg)).toBe("The answer is 42.");
  });

  it("extracts tool calls from assistant message", () => {
    const msg: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "I'll search for that." },
        {
          type: "tool_call",
          id: "call_1",
          name: "search",
          arguments: { query: "cats" },
        },
      ],
    };
    const calls = getToolCalls(msg);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("search");
    expect(calls[0]!.arguments).toEqual({ query: "cats" });
  });

  it("extracts thinking content", () => {
    const msg: AssistantMessage = {
      role: "assistant",
      content: [
        { type: "thinking", text: "part 1 " },
        { type: "text", text: "response" },
        { type: "thinking", text: "part 2" },
      ],
    };
    expect(getThinkingContent(msg)).toBe("part 1 part 2");
  });

  it("extracts text from tool result", () => {
    const msg: ToolResultMessage = {
      role: "tool_result",
      toolCallId: "call_1",
      toolName: "search",
      content: [{ type: "text", text: "Found 3 results." }],
    };
    expect(getTextContent(msg)).toBe("Found 3 results.");
  });
});

// =============================================================================
// CONVERT TO LLM TESTS
// =============================================================================

describe("Convert to LLM", () => {
  it("converts a simple conversation", () => {
    const messages: RuntimeMessage[] = [
      userMessage("What is 2+2?"),
      {
        role: "assistant",
        content: [{ type: "text", text: "4" }],
      },
    ];

    const result = convertToLlm("You are helpful.", messages);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "system", content: "You are helpful." });
    expect(result[1]).toEqual({ role: "user", content: "What is 2+2?" });
    expect(result[2]).toEqual({
      role: "assistant",
      content: "4",
      reasoning: undefined,
      tool_calls: undefined,
    });
  });

  it("converts assistant message with thinking", () => {
    const messages: RuntimeMessage[] = [
      userMessage("Complex question"),
      {
        role: "assistant",
        content: [
          { type: "thinking", text: "Let me reason..." },
          { type: "text", text: "Answer" },
        ],
      },
    ];

    const result = convertToLlm("System", messages);
    expect(result[2]!.reasoning).toBe("Let me reason...");
    expect(result[2]!.content).toBe("Answer");
  });

  it("converts assistant message with tool calls", () => {
    const messages: RuntimeMessage[] = [
      userMessage("Find notes"),
      {
        role: "assistant",
        content: [
          { type: "text", text: "I'll search." },
          {
            type: "tool_call",
            id: "call_1",
            name: "find-notes",
            arguments: { query: "test" },
          },
        ],
      },
      {
        role: "tool_result",
        toolCallId: "call_1",
        toolName: "find-notes",
        content: [{ type: "text", text: "Found 2 notes." }],
      },
    ];

    const result = convertToLlm("System", messages);

    expect(result).toHaveLength(4);
    // Assistant with tool calls
    expect(result[2]!.tool_calls).toHaveLength(1);
    expect(result[2]!.tool_calls![0]!.function.name).toBe("find-notes");
    // Tool result
    expect(result[3]!.role).toBe("tool");
    expect(result[3]!.tool_call_id).toBe("call_1");
    expect(result[3]!.content).toBe("Found 2 notes.");
  });

  it("converts tool result error", () => {
    const messages: RuntimeMessage[] = [
      {
        role: "tool_result",
        toolCallId: "call_1",
        toolName: "search",
        content: [{ type: "text", text: "Not found" }],
        isError: true,
      },
    ];

    const result = convertToLlm("System", messages);
    expect(result[1]!.content).toBe("Error: Not found");
  });
});

// =============================================================================
// TOOL RESULT HELPERS
// =============================================================================

describe("Tool Result Helpers", () => {
  it("creates text result", () => {
    const result = textResult("Found 3 items", { count: 3 });
    expect(result.content).toEqual([{ type: "text", text: "Found 3 items" }]);
    expect(result.details).toEqual({ count: 3 });
    expect(result.isError).toBeUndefined();
  });

  it("creates error result", () => {
    const result = errorResult("Permission denied");
    expect(result.content).toEqual([
      { type: "text", text: "Permission denied" },
    ]);
    expect(result.isError).toBe(true);
  });
});

// =============================================================================
// PROVIDER REGISTRY TESTS
// =============================================================================

describe("Provider Registry", () => {
  beforeEach(() => clearProviders());

  const mockAdapter = {
    dialect: "openai_compatible" as const,
    buildRequest: () => ({}) as any,
    parseResponse: () => ({}) as any,
    transformStream: (s: any) => s,
  };

  it("registers and retrieves providers", () => {
    registerProvider("openai", { adapter: mockAdapter });
    const provider = getProvider("openai");
    expect(provider).toBeDefined();
    expect(provider!.name).toBe("openai");
    expect(provider!.adapter).toBe(mockAdapter);
  });

  it("lists registered providers", () => {
    registerProvider("openai", { adapter: mockAdapter });
    registerProvider("anthropic", {
      adapter: { ...mockAdapter, dialect: "anthropic_messages" as const },
    });
    expect(listProviders()).toEqual(["openai", "anthropic"]);
  });

  it("unregisters providers", () => {
    registerProvider("openai", { adapter: mockAdapter });
    expect(unregisterProvider("openai")).toBe(true);
    expect(getProvider("openai")).toBeUndefined();
  });

  it("looks up adapter by dialect", () => {
    registerProvider("openai", { adapter: mockAdapter });
    const adapter = getAdapterByDialect("openai_compatible");
    expect(adapter).toBe(mockAdapter);
  });

  it("returns undefined for unknown dialect", () => {
    const adapter = getAdapterByDialect("openai_compatible");
    expect(adapter).toBeUndefined();
  });

  it("replaces existing provider on re-register", () => {
    registerProvider("openai", { adapter: mockAdapter });
    const newAdapter = { ...mockAdapter };
    registerProvider("openai", { adapter: newAdapter });
    expect(getProvider("openai")!.adapter).toBe(newAdapter);
  });
});

// =============================================================================
// TOOL REGISTRY TESTS
// =============================================================================

describe("Tool Registry", () => {
  beforeEach(() => clearTools());

  const mockTool: RuntimeToolDefinition = {
    name: "search",
    label: "Search",
    description: "Search for items",
    inputSchema: z.object({ query: z.string() }),
    execute: async () => textResult("results"),
    promptSnippet: "Use search to find items.",
    promptGuidelines: ["Always specify a query", "Limit results to 10"],
  };

  const mockTool2: RuntimeToolDefinition = {
    name: "create",
    label: "Create",
    description: "Create an item",
    inputSchema: z.object({ title: z.string() }),
    execute: async () => textResult("created"),
  };

  it("registers and retrieves tools", () => {
    registerTool(mockTool);
    const tool = getTool("search");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("search");
    expect(tool!.label).toBe("Search");
  });

  it("lists all tools", () => {
    registerTool(mockTool);
    registerTool(mockTool2);
    expect(listTools()).toEqual(["search", "create"]);
  });

  it("returns all tools as active by default", () => {
    registerTool(mockTool);
    registerTool(mockTool2);
    const active = getActiveTools();
    expect(active).toHaveLength(2);
  });

  it("filters active tools", () => {
    registerTool(mockTool);
    registerTool(mockTool2);
    setActiveTools(["search"]);

    expect(getActiveTools()).toHaveLength(1);
    expect(getActiveTools()[0]!.name).toBe("search");
    expect(getTool("create")).toBeUndefined(); // not active
  });

  it("reactivates all tools with null", () => {
    registerTool(mockTool);
    registerTool(mockTool2);
    setActiveTools(["search"]);
    setActiveTools(null);
    expect(getActiveTools()).toHaveLength(2);
  });

  it("unregisters tools", () => {
    registerTool(mockTool);
    expect(unregisterTool("search")).toBe(true);
    expect(getTool("search")).toBeUndefined();
  });

  it("collects prompt contributions from active tools", () => {
    registerTool(mockTool);
    registerTool(mockTool2);

    const contributions = getPromptContributions();
    expect(contributions.snippets).toEqual(["Use search to find items."]);
    expect(contributions.guidelines).toEqual([
      "Always specify a query",
      "Limit results to 10",
    ]);
  });

  it("only collects contributions from active tools", () => {
    registerTool(mockTool);
    registerTool(mockTool2);
    setActiveTools(["create"]); // create has no prompt contributions

    const contributions = getPromptContributions();
    expect(contributions.snippets).toHaveLength(0);
    expect(contributions.guidelines).toHaveLength(0);
  });
});

// =============================================================================
// SKILL REGISTRY TESTS
// =============================================================================

describe("Skill Registry", () => {
  let tempDir: string;

  beforeEach(() => {
    clearSkillSources();
    tempDir = createTempDir();
  });

  function createSkillDir(
    name: string,
    frontmatter: Record<string, string | boolean>,
    body: string,
  ): void {
    const skillDir = path.join(tempDir, name);
    fs.mkdirSync(skillDir, { recursive: true });

    const lines = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const content = `---\n${lines}\n---\n${body}`;
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  }

  it("discovers skills from a directory", () => {
    createSkillDir(
      "writing-style",
      {
        name: "writing-style",
        description: "Team writing conventions",
      },
      "# Writing Style\nUse active voice.",
    );

    registerSkillSource(tempDir, "workspace");
    const skills = discoverSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("writing-style");
    expect(skills[0]!.description).toBe("Team writing conventions");
    expect(skills[0]!.scope).toBe("workspace");
  });

  it("gets a skill by name", () => {
    createSkillDir(
      "code-review",
      {
        name: "code-review",
        description: "Code review checklist",
      },
      "# Code Review\n- Check tests",
    );

    registerSkillSource(tempDir, "user");
    const skill = getSkill("code-review");
    expect(skill).toBeDefined();
    expect(skill!.name).toBe("code-review");
  });

  it("loads full skill content (body without frontmatter)", () => {
    createSkillDir(
      "testing",
      {
        name: "testing",
        description: "Testing guidelines",
      },
      "# Testing\nAlways write tests.",
    );

    registerSkillSource(tempDir, "workspace");
    const content = loadSkillContent("testing");
    expect(content).toBe("# Testing\nAlways write tests.");
  });

  it("generates skill summary for system prompt", () => {
    createSkillDir(
      "skill-a",
      { name: "skill-a", description: "First skill" },
      "Content A",
    );
    createSkillDir(
      "skill-b",
      { name: "skill-b", description: "Second skill" },
      "Content B",
    );

    registerSkillSource(tempDir, "workspace");
    const summary = getSkillSummary();
    expect(summary).toContain("skill-a: First skill");
    expect(summary).toContain("skill-b: Second skill");
  });

  it("rejects skills where name doesn't match directory", () => {
    createSkillDir(
      "my-dir",
      {
        name: "different-name",
        description: "Mismatched name",
      },
      "Content",
    );

    registerSkillSource(tempDir, "workspace");
    const skills = discoverSkills();
    expect(skills).toHaveLength(0);
  });

  it("rejects skills without description", () => {
    createSkillDir("no-desc", { name: "no-desc" }, "Content");

    registerSkillSource(tempDir, "workspace");
    const skills = discoverSkills();
    expect(skills).toHaveLength(0);
  });

  it("handles non-existent directories gracefully", () => {
    registerSkillSource("/non/existent/path", "workspace");
    const skills = discoverSkills();
    expect(skills).toHaveLength(0);
  });

  it("returns empty summary when no skills", () => {
    const summary = getSkillSummary();
    expect(summary).toBe("");
  });
});

// =============================================================================
// CONVERT FROM LLM TESTS
// =============================================================================

describe("convertFromLlm", () => {
  it("converts user message with string content", () => {
    const messages: AIMessage[] = [{ role: "user", content: "hello" }];
    const result = convertFromLlm(messages);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
    expect(result[0]).toHaveProperty("content", "hello");
  });

  it("converts user message with multimodal content", () => {
    const messages: AIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "What is this?" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,abc123" },
          },
        ],
      },
    ];
    const result = convertFromLlm(messages);
    expect(result).toHaveLength(1);
    const user = result[0]!;
    expect(user.role).toBe("user");
    expect(Array.isArray(user.content)).toBe(true);
    const blocks = user.content as Array<{ type: string }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ type: "text", text: "What is this?" });
    expect(blocks[1]).toEqual({
      type: "image",
      mimeType: "image/png",
      data: "abc123",
    });
  });

  it("converts assistant message with text only", () => {
    const messages: AIMessage[] = [{ role: "assistant", content: "Hi there" }];
    const result = convertFromLlm(messages);
    expect(result).toHaveLength(1);
    const msg = result[0]!;
    expect(msg.role).toBe("assistant");
    const content = (msg as { content: Array<{ type: string }> }).content;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({ type: "text", text: "Hi there" });
  });

  it("converts assistant message with reasoning", () => {
    const messages: AIMessage[] = [
      { role: "assistant", content: "answer", reasoning: "thinking..." },
    ];
    const result = convertFromLlm(messages);
    const content = (
      result[0]! as { content: Array<{ type: string; text: string }> }
    ).content;
    expect(content).toHaveLength(2);
    expect(content[0]).toEqual({ type: "thinking", text: "thinking..." });
    expect(content[1]).toEqual({ type: "text", text: "answer" });
  });

  it("converts assistant message with tool calls", () => {
    const messages: AIMessage[] = [
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "findNotes", arguments: '{"text":"hello"}' },
          },
        ],
      },
    ];
    const result = convertFromLlm(messages);
    const content = (result[0]! as { content: Array<{ type: string }> })
      .content;
    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({
      type: "tool_call",
      id: "call_1",
      name: "findNotes",
      arguments: { text: "hello" },
    });
  });

  it("converts tool result message", () => {
    const messages: AIMessage[] = [
      {
        role: "tool",
        content: "result text",
        tool_call_id: "call_1",
        name: "findNotes",
      },
    ];
    const result = convertFromLlm(messages);
    expect(result).toHaveLength(1);
    const msg = result[0]!;
    expect(msg.role).toBe("tool_result");
    expect(msg).toHaveProperty("toolCallId", "call_1");
    expect(msg).toHaveProperty("toolName", "findNotes");
    expect(msg).toHaveProperty("isError", undefined);
  });

  it("converts tool error result", () => {
    const messages: AIMessage[] = [
      {
        role: "tool",
        content: "Error: something failed",
        tool_call_id: "call_2",
        name: "search",
      },
    ];
    const result = convertFromLlm(messages);
    const msg = result[0]!;
    expect(msg).toHaveProperty("isError", true);
    const content = (msg as { content: Array<{ type: string; text: string }> })
      .content;
    expect(content[0]!.text).toBe("something failed");
  });

  it("filters out system messages", () => {
    const messages: AIMessage[] = [
      { role: "system", content: "You are a helper" },
      { role: "user", content: "hi" },
    ];
    const result = convertFromLlm(messages);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
  });

  it("handles empty input", () => {
    expect(convertFromLlm([])).toEqual([]);
  });

  it("round-trip preserves semantic content", () => {
    const original: AIMessage[] = [
      { role: "user", content: "search for notes about cooking" },
      {
        role: "assistant",
        content: "Let me search for that.",
        reasoning: "User wants cooking notes",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "findNotes", arguments: '{"text":"cooking"}' },
          },
        ],
      },
      {
        role: "tool",
        content: '[{"title":"Recipe"}]',
        tool_call_id: "call_1",
        name: "findNotes",
      },
      { role: "assistant", content: "I found a recipe note." },
    ];

    // Convert to RuntimeMessage, then back to AIMessage
    const runtimeMessages = convertFromLlm(original);
    const roundTripped = convertToLlm("sys", runtimeMessages);

    // System prompt is added by convertToLlm, filter it out
    const nonSystem = roundTripped.filter((m) => m.role !== "system");
    expect(nonSystem).toHaveLength(4);

    // User message preserved
    expect(nonSystem[0]!.content).toBe("search for notes about cooking");

    // Assistant with tool call preserved
    expect(nonSystem[1]!.content).toBe("Let me search for that.");
    expect(nonSystem[1]!.reasoning).toBe("User wants cooking notes");
    expect(nonSystem[1]!.tool_calls).toHaveLength(1);
    expect(nonSystem[1]!.tool_calls![0]!.function.name).toBe("findNotes");

    // Tool result preserved
    expect(nonSystem[2]!.role).toBe("tool");
    expect(nonSystem[2]!.content).toBe('[{"title":"Recipe"}]');

    // Final assistant message preserved
    expect(nonSystem[3]!.content).toBe("I found a recipe note.");
  });
});
