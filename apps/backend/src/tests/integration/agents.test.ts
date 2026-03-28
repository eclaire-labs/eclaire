import { afterAll, describe, expect, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
  TEST_API_KEY_2,
} from "../utils/test-helpers.js";

interface AgentResponse {
  id: string;
  kind: "builtin" | "custom";
  name: string;
  description: string | null;
  systemPrompt: string;
  toolNames: string[];
  skillNames: string[];
  modelId: string | null;
  isEditable: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface AgentListResponse {
  items: AgentResponse[];
}

interface AgentCatalogResponse {
  tools: Array<{
    name: string;
    label: string;
    description: string;
    accessLevel: string;
  }>;
  skills: Array<{
    name: string;
    description: string;
    scope: string;
  }>;
}

describe("Agent API Integration Tests", () => {
  const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);
  const authenticatedFetch2 = createAuthenticatedFetch(TEST_API_KEY_2);
  const agentIdsToCleanup: string[] = [];

  afterAll(async () => {
    // Clean up any agents created during tests
    for (const id of agentIdsToCleanup) {
      try {
        await authenticatedFetch(`${BASE_URL}/agents/${id}`, {
          method: "DELETE",
        });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  // -----------------------------------------------------------------------
  // Catalog
  // -----------------------------------------------------------------------
  describe("GET /api/agents/catalog", () => {
    it("returns tools and skills arrays", async () => {
      await delay(200);
      const response = await authenticatedFetch(`${BASE_URL}/agents/catalog`);

      expect(response.status).toBe(200);
      const data = (await response.json()) as AgentCatalogResponse;

      expect(Array.isArray(data.tools)).toBe(true);
      expect(data.tools.length).toBeGreaterThan(0);
      expect(Array.isArray(data.skills)).toBe(true);

      // Verify tool shape
      const firstTool = data.tools[0];
      expect(firstTool).toHaveProperty("name");
      expect(firstTool).toHaveProperty("label");
      expect(firstTool).toHaveProperty("description");
      expect(firstTool).toHaveProperty("accessLevel");

      // Verify tools are sorted by label
      const labels = data.tools.map((t) => t.label);
      const sorted = [...labels].sort((a, b) => a.localeCompare(b));
      expect(labels).toEqual(sorted);
    });

    it("returns 404 for unknown skill", async () => {
      const response = await authenticatedFetch(
        `${BASE_URL}/agents/catalog/skills/nonexistent-skill-xyz`,
      );

      expect(response.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // CRUD Lifecycle
  // -----------------------------------------------------------------------
  describe("CRUD Lifecycle", () => {
    let createdAgentId: string | null = null;

    it("GET /api/agents - lists agents with default agent first", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`);

      expect(response.status).toBe(200);
      const data = (await response.json()) as AgentListResponse;

      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items.length).toBeGreaterThanOrEqual(1);

      // First agent should be the built-in default
      const defaultAgent = data.items[0];
      expect(defaultAgent.kind).toBe("builtin");
      expect(defaultAgent.isEditable).toBe(false);
    });

    it("POST /api/agents - creates a new custom agent", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "  Integration Test Agent  ",
          description: "Agent created by integration tests",
          systemPrompt: "You are a test agent. Be helpful.",
          toolNames: ["findContent"],
          skillNames: [],
        }),
      });

      expect(response.status).toBe(201);
      const agent = (await response.json()) as AgentResponse;

      createdAgentId = agent.id;
      agentIdsToCleanup.push(agent.id);

      expect(agent.id).toMatch(/^agent-/);
      expect(agent.kind).toBe("custom");
      expect(agent.isEditable).toBe(true);
      // Name should be trimmed
      expect(agent.name).toBe("Integration Test Agent");
      expect(agent.systemPrompt).toBe("You are a test agent. Be helpful.");
      expect(agent.toolNames).toEqual(["findContent"]);
      expect(agent.modelId).toBeNull();
    });

    it("GET /api/agents/:id - retrieves the created agent", async () => {
      expect(createdAgentId).not.toBeNull();

      const response = await authenticatedFetch(
        `${BASE_URL}/agents/${createdAgentId}`,
      );

      expect(response.status).toBe(200);
      const agent = (await response.json()) as AgentResponse;

      expect(agent.id).toBe(createdAgentId);
      expect(agent.name).toBe("Integration Test Agent");
    });

    it("GET /api/agents - newly created agent appears in list", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`);
      const data = (await response.json()) as AgentListResponse;

      const ids = data.items.map((a) => a.id);
      expect(ids).toContain(createdAgentId);
    });

    it("PUT /api/agents/:id - updates the agent name", async () => {
      expect(createdAgentId).not.toBeNull();

      const response = await authenticatedFetch(
        `${BASE_URL}/agents/${createdAgentId}`,
        {
          method: "PUT",
          body: JSON.stringify({ name: "Updated Test Agent" }),
        },
      );

      expect(response.status).toBe(200);
      const agent = (await response.json()) as AgentResponse;

      expect(agent.name).toBe("Updated Test Agent");
      // Other fields should be preserved
      expect(agent.systemPrompt).toBe("You are a test agent. Be helpful.");
    });

    it("PUT /api/agents/:id - updates toolNames", async () => {
      expect(createdAgentId).not.toBeNull();

      const response = await authenticatedFetch(
        `${BASE_URL}/agents/${createdAgentId}`,
        {
          method: "PUT",
          body: JSON.stringify({ toolNames: ["findContent", "createNote"] }),
        },
      );

      expect(response.status).toBe(200);
      const agent = (await response.json()) as AgentResponse;

      expect(agent.toolNames).toContain("findContent");
      expect(agent.toolNames).toContain("createNote");
    });

    it("DELETE /api/agents/:id - deletes the agent", async () => {
      expect(createdAgentId).not.toBeNull();

      const response = await authenticatedFetch(
        `${BASE_URL}/agents/${createdAgentId}`,
        { method: "DELETE" },
      );

      expect(response.status).toBe(204);

      // Remove from cleanup since it's already deleted
      const idx = agentIdsToCleanup.indexOf(createdAgentId!);
      if (idx !== -1) agentIdsToCleanup.splice(idx, 1);
    });

    it("GET /api/agents/:id - returns 404 after deletion", async () => {
      expect(createdAgentId).not.toBeNull();

      const response = await authenticatedFetch(
        `${BASE_URL}/agents/${createdAgentId}`,
      );

      expect(response.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Validation (Zod + Service Layer)
  // -----------------------------------------------------------------------
  describe("Validation", () => {
    it("POST /api/agents - rejects empty name", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "",
          systemPrompt: "Prompt",
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("POST /api/agents - rejects name exceeding 80 chars", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "A".repeat(81),
          systemPrompt: "Prompt",
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("POST /api/agents - rejects systemPrompt exceeding 12000 chars", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "Long Prompt Agent",
          systemPrompt: "P".repeat(12001),
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("POST /api/agents - rejects unknown toolNames", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "Bad Tools Agent",
          systemPrompt: "Prompt",
          toolNames: ["nonexistentToolXyz123"],
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("POST /api/agents - rejects unknown skillNames", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "Bad Skills Agent",
          systemPrompt: "Prompt",
          skillNames: ["nonexistent-skill-xyz123"],
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("POST /api/agents - rejects invalid modelId format", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "Bad Model Agent",
          systemPrompt: "Prompt",
          modelId: "no-colon-here",
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("PUT /api/agents/eclaire - rejects update to default agent", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents/eclaire`, {
        method: "PUT",
        body: JSON.stringify({ name: "Hacked" }),
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("DELETE /api/agents/eclaire - rejects deletion of default agent", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents/eclaire`, {
        method: "DELETE",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("PUT /api/agents/:id - rejects empty update body", async () => {
      // Create a temp agent to update
      const createRes = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "Temp Agent For Empty Update",
          systemPrompt: "Prompt",
        }),
      });
      const created = (await createRes.json()) as AgentResponse;
      agentIdsToCleanup.push(created.id);

      const response = await authenticatedFetch(
        `${BASE_URL}/agents/${created.id}`,
        {
          method: "PUT",
          body: JSON.stringify({}),
        },
      );

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  // -----------------------------------------------------------------------
  // User Isolation
  // -----------------------------------------------------------------------
  describe("User Isolation", () => {
    let isolatedAgentId: string | null = null;

    it("setup: create agent with user 1", async () => {
      const response = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "User1 Isolated Agent",
          systemPrompt: "Private agent",
        }),
      });

      expect(response.status).toBe(201);
      const agent = (await response.json()) as AgentResponse;
      isolatedAgentId = agent.id;
      agentIdsToCleanup.push(agent.id);
    });

    it("user 2 cannot read user 1's agent", async () => {
      expect(isolatedAgentId).not.toBeNull();

      const response = await authenticatedFetch2(
        `${BASE_URL}/agents/${isolatedAgentId}`,
      );

      expect(response.status).toBe(404);
    });

    it("user 2 cannot update user 1's agent", async () => {
      expect(isolatedAgentId).not.toBeNull();

      const response = await authenticatedFetch2(
        `${BASE_URL}/agents/${isolatedAgentId}`,
        {
          method: "PUT",
          body: JSON.stringify({ name: "Hijacked" }),
        },
      );

      expect(response.status).toBe(404);
    });

    it("user 2 cannot delete user 1's agent", async () => {
      expect(isolatedAgentId).not.toBeNull();

      const response = await authenticatedFetch2(
        `${BASE_URL}/agents/${isolatedAgentId}`,
        { method: "DELETE" },
      );

      expect(response.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Auth Enforcement
  // -----------------------------------------------------------------------
  describe("Auth Enforcement", () => {
    it("unauthenticated request returns 401", async () => {
      const response = await fetch(`${BASE_URL}/agents`);

      expect(response.status).toBe(401);
    });

    it("invalid API key returns 401", async () => {
      const badFetch = createAuthenticatedFetch("sk-INVALID-KEY-123456");
      const response = await badFetch(`${BASE_URL}/agents`);

      expect(response.status).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // Duplicate Name Handling
  // -----------------------------------------------------------------------
  describe("Duplicate Name Handling", () => {
    it("rejects case-insensitive duplicate name for same user", async () => {
      // Create first agent
      const res1 = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "Unique Name Test Bot",
          systemPrompt: "Prompt A",
        }),
      });
      expect(res1.status).toBe(201);
      const agent1 = (await res1.json()) as AgentResponse;
      agentIdsToCleanup.push(agent1.id);

      // Try to create with same name (different case)
      const res2 = await authenticatedFetch(`${BASE_URL}/agents`, {
        method: "POST",
        body: JSON.stringify({
          name: "unique name test bot",
          systemPrompt: "Prompt B",
        }),
      });

      expect(res2.status).toBeGreaterThanOrEqual(400);
      expect(res2.status).toBeLessThan(500);
    });
  });
});
