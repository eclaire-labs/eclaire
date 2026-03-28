import { describe, expect, it } from "vitest";
import {
  buildAgentHandleCandidates,
  parseAddressedPrompt,
} from "../../lib/channels.js";

describe("buildAgentHandleCandidates", () => {
  it("normalizes a simple name to lowercase kebab-case", () => {
    expect(buildAgentHandleCandidates("My Agent")).toEqual([
      "my-agent",
      "my_agent",
      "myagent",
    ]);
  });

  it("handles single-word names", () => {
    const result = buildAgentHandleCandidates("Eclaire");
    expect(result).toContain("eclaire");
  });

  it("normalizes unicode characters via NFKD", () => {
    const result = buildAgentHandleCandidates("Café Bot");
    expect(result).toContain("cafe-bot");
  });

  it("strips non-alphanumeric characters", () => {
    const result = buildAgentHandleCandidates("Agent #1 (Test)");
    expect(result).toContain("agent-1-test");
  });

  it("collapses multiple separators", () => {
    const result = buildAgentHandleCandidates("My   Agent---Name");
    expect(result).toContain("my-agent-name");
  });

  it("returns empty array for empty string", () => {
    expect(buildAgentHandleCandidates("")).toEqual([]);
  });

  it("returns empty array for string of only special characters", () => {
    expect(buildAgentHandleCandidates("!@#$%")).toEqual([]);
  });

  it("handles underscores in name", () => {
    const result = buildAgentHandleCandidates("my_agent_name");
    expect(result).toContain("my-agent-name");
    expect(result).toContain("my_agent_name");
  });

  it("deduplicates candidates", () => {
    const result = buildAgentHandleCandidates("test");
    // "test" with hyphens removed, underscores, no-separators are all "test"
    expect(new Set(result).size).toBe(result.length);
  });
});

describe("parseAddressedPrompt", () => {
  it("parses @agent-name followed by a prompt", () => {
    const result = parseAddressedPrompt("@my-agent hello world");
    expect(result).toEqual({
      handle: "my-agent",
      cleanedPrompt: "hello world",
    });
  });

  it("handles colon separator after handle", () => {
    const result = parseAddressedPrompt("@my-agent: do something");
    expect(result).toEqual({
      handle: "my-agent",
      cleanedPrompt: "do something",
    });
  });

  it("handles comma separator after handle", () => {
    const result = parseAddressedPrompt("@bot, help me");
    expect(result).toEqual({
      handle: "bot",
      cleanedPrompt: "help me",
    });
  });

  it("lowercases the handle", () => {
    const result = parseAddressedPrompt("@MyAgent test");
    expect(result?.handle).toBe("myagent");
  });

  it("returns null for messages without @mention", () => {
    expect(parseAddressedPrompt("hello world")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAddressedPrompt("")).toBeNull();
  });

  it("handles @mention with no following text", () => {
    const result = parseAddressedPrompt("@my-agent");
    expect(result).not.toBeNull();
    expect(result?.handle).toBe("my-agent");
    expect(result?.cleanedPrompt).toBe("");
  });

  it("handles leading whitespace before @mention", () => {
    const result = parseAddressedPrompt("  @agent hello");
    expect(result).toEqual({
      handle: "agent",
      cleanedPrompt: "hello",
    });
  });

  it("handles handles with underscores and numbers", () => {
    const result = parseAddressedPrompt("@agent_v2 test");
    expect(result?.handle).toBe("agent_v2");
  });
});
