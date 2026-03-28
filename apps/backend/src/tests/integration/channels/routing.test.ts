import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DB_TEST_CONFIGS,
  type TestDatabase,
  initTestDatabase,
} from "../../db/setup.js";
import { createTestDeps } from "./helpers/create-test-deps.js";
import { seedAgent, seedChannel } from "./helpers/seed-channel.js";

describe.each(DB_TEST_CONFIGS)("$label - Channel Routing Integration", ({
  dbType,
}) => {
  let testDb: TestDatabase;
  let routeChannelPrompt: ReturnType<
    typeof createTestDeps
  >["deps"]["routeChannelPrompt"];

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = await initTestDatabase(dbType);
    const { deps } = createTestDeps(testDb, "telegram");
    routeChannelPrompt = deps.routeChannelPrompt;
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("routes to default agent when no @mention is present", async () => {
    const { userId } = await seedChannel(testDb);
    const defaultAgentId = "default-agent-id";

    const result = await routeChannelPrompt(
      userId,
      "hello world",
      defaultAgentId,
    );

    expect(result).toEqual({
      agentActorId: defaultAgentId,
      prompt: "hello world",
    });
  });

  it("routes @mention to the matching agent with cleaned prompt", async () => {
    const { userId } = await seedChannel(testDb);
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });

    const result = await routeChannelPrompt(
      userId,
      "@research-bot summarize this",
      "default-agent",
    );

    expect(result).toEqual({
      agentActorId: agentId,
      prompt: "summarize this",
      addressedAgentName: "Research Bot",
    });
  });

  it("matches kebab-case handle format", async () => {
    const { userId } = await seedChannel(testDb);
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });

    const result = await routeChannelPrompt(
      userId,
      "@research-bot do work",
      "default",
    );

    expect(result.agentActorId).toBe(agentId);
  });

  it("matches snake_case handle format", async () => {
    const { userId } = await seedChannel(testDb);
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });

    const result = await routeChannelPrompt(
      userId,
      "@research_bot do work",
      "default",
    );

    expect(result.agentActorId).toBe(agentId);
  });

  it("matches no-separator handle format", async () => {
    const { userId } = await seedChannel(testDb);
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });

    const result = await routeChannelPrompt(
      userId,
      "@researchbot do work",
      "default",
    );

    expect(result.agentActorId).toBe(agentId);
  });

  it("matches handles case-insensitively", async () => {
    const { userId } = await seedChannel(testDb);
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });

    const result = await routeChannelPrompt(
      userId,
      "@ResearchBot do work",
      "default",
    );

    expect(result.agentActorId).toBe(agentId);
  });

  it("returns error with suggestions for unknown agent", async () => {
    const { userId } = await seedChannel(testDb);
    await seedAgent(testDb, userId, { name: "Research Bot" });
    await seedAgent(testDb, userId, { name: "Writer Bot" });

    const result = await routeChannelPrompt(
      userId,
      "@nonexistent hello",
      "default-agent",
    );

    expect(result.agentActorId).toBe("default-agent");
    expect(result.error).toContain("couldn't find agent @nonexistent");
    expect(result.error).toContain("@research-bot");
    expect(result.error).toContain("@writer-bot");
  });

  it("returns error when @mention has no following prompt", async () => {
    const { userId } = await seedChannel(testDb);
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Research Bot",
    });

    const result = await routeChannelPrompt(userId, "@research-bot", "default");

    expect(result.agentActorId).toBe(agentId);
    expect(result.error).toContain("Tell me what you want Research Bot to do");
  });

  it("selects the correct agent when multiple agents exist", async () => {
    const { userId } = await seedChannel(testDb);
    await seedAgent(testDb, userId, { name: "Alpha Bot" });
    const { agentId: betaId } = await seedAgent(testDb, userId, {
      name: "Beta Bot",
    });
    await seedAgent(testDb, userId, { name: "Gamma Bot" });

    const result = await routeChannelPrompt(
      userId,
      "@beta-bot run analysis",
      "default",
    );

    expect(result).toEqual({
      agentActorId: betaId,
      prompt: "run analysis",
      addressedAgentName: "Beta Bot",
    });
  });

  it("matches unicode agent names via NFKD normalization", async () => {
    const { userId } = await seedChannel(testDb);
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Café Bot",
    });

    const result = await routeChannelPrompt(
      userId,
      "@cafe-bot make espresso",
      "default",
    );

    expect(result).toEqual({
      agentActorId: agentId,
      prompt: "make espresso",
      addressedAgentName: "Café Bot",
    });
  });

  it("strips @mention prefix and returns only the clean prompt", async () => {
    const { userId } = await seedChannel(testDb);
    const { agentId } = await seedAgent(testDb, userId, {
      name: "Writer Bot",
    });

    const result = await routeChannelPrompt(
      userId,
      "@writer-bot: write me a poem about cats",
      "default",
    );

    expect(result.agentActorId).toBe(agentId);
    expect(result.prompt).toBe("write me a poem about cats");
    expect(result.prompt).not.toContain("@writer-bot");
  });
});
