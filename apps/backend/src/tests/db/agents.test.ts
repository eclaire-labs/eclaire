import { and, desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestUser,
  DB_TEST_CONFIGS,
  generateTestAgentId,
  initTestDatabase,
  type TestDatabase,
} from "./setup.js";

describe.each(DB_TEST_CONFIGS)("$label - Agents DB Integration Tests", ({
  dbType,
}) => {
  let testDb: TestDatabase;
  let testUserId: string;

  beforeEach(async () => {
    testDb = await initTestDatabase(dbType);
    const user = await createTestUser(testDb);
    testUserId = user.id;
  });

  afterEach(async () => {
    if (testDb) {
      await testDb.cleanup();
    }
  });

  function getSchema() {
    return testDb.schema;
  }

  // -----------------------------------------------------------------------
  // Schema Constraints
  // -----------------------------------------------------------------------
  describe("Schema Constraints", () => {
    it("inserts an agent and verifies round-trip of all fields", async () => {
      const { db } = testDb;
      const s = getSchema();
      const agentId = generateTestAgentId();

      await db.insert(s.agents).values({
        id: agentId,
        userId: testUserId,
        name: "Research Bot",
        description: "A research assistant",
        systemPrompt: "You are a research bot.",
        toolNames: ["findContent", "sendEmail"],
        skillNames: ["coding-assistant"],
        modelId: "openai:gpt-4o",
      });

      const [agent] = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, agentId));

      expect(agent).toBeDefined();
      expect(agent.name).toBe("Research Bot");
      expect(agent.description).toBe("A research assistant");
      expect(agent.systemPrompt).toBe("You are a research bot.");
      expect(agent.modelId).toBe("openai:gpt-4o");
      // JSON arrays round-trip as real arrays
      expect(Array.isArray(agent.toolNames)).toBe(true);
      expect(agent.toolNames).toEqual(["findContent", "sendEmail"]);
      expect(Array.isArray(agent.skillNames)).toBe(true);
      expect(agent.skillNames).toEqual(["coding-assistant"]);
      // Timestamps are present
      expect(agent.createdAt).toBeInstanceOf(Date);
      expect(agent.updatedAt).toBeInstanceOf(Date);
    });

    it("rejects insert when userId references a non-existent user", async () => {
      const { db } = testDb;
      const s = getSchema();

      await expect(
        db.insert(s.agents).values({
          userId: "user-nonexistent",
          name: "Ghost Agent",
          systemPrompt: "You are a ghost.",
          toolNames: [],
          skillNames: [],
        }),
      ).rejects.toThrow();
    });

    it("enforces unique index on (userId, lower(name))", async () => {
      const { db } = testDb;
      const s = getSchema();

      await db.insert(s.agents).values({
        userId: testUserId,
        name: "My Agent",
        systemPrompt: "Prompt A",
        toolNames: [],
        skillNames: [],
      });

      await expect(
        db.insert(s.agents).values({
          userId: testUserId,
          name: "my agent",
          systemPrompt: "Prompt B",
          toolNames: [],
          skillNames: [],
        }),
      ).rejects.toThrow();
    });

    it("allows same agent name for different users", async () => {
      const { db } = testDb;
      const s = getSchema();

      const user2 = await createTestUser(testDb);

      await db.insert(s.agents).values({
        userId: testUserId,
        name: "Shared Name",
        systemPrompt: "Prompt A",
        toolNames: [],
        skillNames: [],
      });

      // Should not throw
      await db.insert(s.agents).values({
        userId: user2.id,
        name: "Shared Name",
        systemPrompt: "Prompt B",
        toolNames: [],
        skillNames: [],
      });

      const allAgents = await db.select().from(s.agents);
      expect(allAgents).toHaveLength(2);
    });

    it("auto-generates agent ID when none provided", async () => {
      const { db } = testDb;
      const s = getSchema();

      const [agent] = await db
        .insert(s.agents)
        .values({
          userId: testUserId,
          name: "Auto ID Agent",
          systemPrompt: "Prompt",
          toolNames: [],
          skillNames: [],
        })
        .returning();

      expect(agent.id).toBeDefined();
      expect(agent.id).toMatch(/^agent-/);
    });

    it("stores null modelId correctly", async () => {
      const { db } = testDb;
      const s = getSchema();

      const [agent] = await db
        .insert(s.agents)
        .values({
          userId: testUserId,
          name: "No Model Agent",
          systemPrompt: "Prompt",
          toolNames: [],
          skillNames: [],
        })
        .returning();

      expect(agent.modelId).toBeNull();
    });

    it("stores and retrieves empty arrays for toolNames/skillNames", async () => {
      const { db } = testDb;
      const s = getSchema();

      const [agent] = await db
        .insert(s.agents)
        .values({
          userId: testUserId,
          name: "Empty Arrays Agent",
          systemPrompt: "Prompt",
          toolNames: [],
          skillNames: [],
        })
        .returning();

      // Re-read from DB to verify storage
      const [fromDb] = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, agent.id));

      expect(Array.isArray(fromDb.toolNames)).toBe(true);
      expect(fromDb.toolNames).toEqual([]);
      expect(Array.isArray(fromDb.skillNames)).toBe(true);
      expect(fromDb.skillNames).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Cascade Deletes
  // -----------------------------------------------------------------------
  describe("Cascade Deletes", () => {
    it("deletes agents when the owning user is deleted", async () => {
      const { db } = testDb;
      const s = getSchema();

      await db.insert(s.agents).values([
        {
          userId: testUserId,
          name: "Agent 1",
          systemPrompt: "P1",
          toolNames: [],
          skillNames: [],
        },
        {
          userId: testUserId,
          name: "Agent 2",
          systemPrompt: "P2",
          toolNames: [],
          skillNames: [],
        },
      ]);

      // Verify agents exist
      const before = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.userId, testUserId));
      expect(before).toHaveLength(2);

      // Delete the user
      await db.delete(s.users).where(eq(s.users.id, testUserId));

      // Agents should be gone
      const after = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.userId, testUserId));
      expect(after).toHaveLength(0);
    });

    it("does not affect other users' agents on cascade", async () => {
      const { db } = testDb;
      const s = getSchema();

      const user2 = await createTestUser(testDb);

      await db.insert(s.agents).values({
        userId: testUserId,
        name: "User1 Agent",
        systemPrompt: "P1",
        toolNames: [],
        skillNames: [],
      });

      await db.insert(s.agents).values({
        userId: user2.id,
        name: "User2 Agent",
        systemPrompt: "P2",
        toolNames: [],
        skillNames: [],
      });

      // Delete user 1
      await db.delete(s.users).where(eq(s.users.id, testUserId));

      // User 2's agent should still exist
      const remaining = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.userId, user2.id));
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe("User2 Agent");
    });
  });

  // -----------------------------------------------------------------------
  // Transaction Atomicity (mirrors createAgent/deleteAgent in agents.ts)
  // PGlite only — better-sqlite3 doesn't support async transaction callbacks
  // -----------------------------------------------------------------------
  describe.skipIf(dbType === "sqlite")("Transaction Atomicity", () => {
    it("creates agent and actor atomically in a transaction", async () => {
      const { db } = testDb;
      const s = getSchema();
      const agentId = generateTestAgentId();

      await db.transaction(async (tx: typeof db) => {
        await tx.insert(s.agents).values({
          id: agentId,
          userId: testUserId,
          name: "Tx Agent",
          systemPrompt: "Prompt",
          toolNames: [],
          skillNames: [],
        });

        await tx.insert(s.actors).values({
          id: agentId,
          ownerUserId: testUserId,
          kind: "agent",
          displayName: "Tx Agent",
        });
      });

      const [agent] = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, agentId));
      const [actor] = await db
        .select()
        .from(s.actors)
        .where(eq(s.actors.id, agentId));

      expect(agent).toBeDefined();
      expect(actor).toBeDefined();
      expect(actor.kind).toBe("agent");
    });

    it("rolls back both agent and actor on transaction failure", async () => {
      const { db } = testDb;
      const s = getSchema();
      const agentId = generateTestAgentId();

      await expect(
        db.transaction(async (tx: typeof db) => {
          await tx.insert(s.agents).values({
            id: agentId,
            userId: testUserId,
            name: "Rollback Agent",
            systemPrompt: "Prompt",
            toolNames: [],
            skillNames: [],
          });

          await tx.insert(s.actors).values({
            id: agentId,
            ownerUserId: testUserId,
            kind: "agent",
            displayName: "Rollback Agent",
          });

          throw new Error("Simulated failure");
        }),
      ).rejects.toThrow("Simulated failure");

      // Neither should persist
      const agents = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, agentId));
      const actors = await db
        .select()
        .from(s.actors)
        .where(eq(s.actors.id, agentId));

      expect(agents).toHaveLength(0);
      expect(actors).toHaveLength(0);
    });

    it("deletes agent and actor atomically in a transaction", async () => {
      const { db } = testDb;
      const s = getSchema();
      const agentId = generateTestAgentId();

      // Pre-insert
      await db.insert(s.agents).values({
        id: agentId,
        userId: testUserId,
        name: "Delete Me",
        systemPrompt: "Prompt",
        toolNames: [],
        skillNames: [],
      });
      await db.insert(s.actors).values({
        id: agentId,
        ownerUserId: testUserId,
        kind: "agent",
        displayName: "Delete Me",
      });

      await db.transaction(async (tx: typeof db) => {
        await tx
          .delete(s.agents)
          .where(
            and(eq(s.agents.id, agentId), eq(s.agents.userId, testUserId)),
          );
        await tx
          .delete(s.actors)
          .where(and(eq(s.actors.id, agentId), eq(s.actors.kind, "agent")));
      });

      const agents = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, agentId));
      const actors = await db
        .select()
        .from(s.actors)
        .where(eq(s.actors.id, agentId));

      expect(agents).toHaveLength(0);
      expect(actors).toHaveLength(0);
    });

    it("rolls back delete of both agent and actor on transaction failure", async () => {
      const { db } = testDb;
      const s = getSchema();
      const agentId = generateTestAgentId();

      // Pre-insert
      await db.insert(s.agents).values({
        id: agentId,
        userId: testUserId,
        name: "Keep Me",
        systemPrompt: "Prompt",
        toolNames: [],
        skillNames: [],
      });
      await db.insert(s.actors).values({
        id: agentId,
        ownerUserId: testUserId,
        kind: "agent",
        displayName: "Keep Me",
      });

      await expect(
        db.transaction(async (tx: typeof db) => {
          await tx
            .delete(s.agents)
            .where(
              and(eq(s.agents.id, agentId), eq(s.agents.userId, testUserId)),
            );
          await tx
            .delete(s.actors)
            .where(and(eq(s.actors.id, agentId), eq(s.actors.kind, "agent")));
          throw new Error("Simulated delete failure");
        }),
      ).rejects.toThrow("Simulated delete failure");

      // Both should still exist
      const agents = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, agentId));
      const actors = await db
        .select()
        .from(s.actors)
        .where(eq(s.actors.id, agentId));

      expect(agents).toHaveLength(1);
      expect(actors).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Query Patterns
  // -----------------------------------------------------------------------
  describe("Query Patterns", () => {
    it("lists agents for a user ordered by updatedAt descending", async () => {
      const { db } = testDb;
      const s = getSchema();

      const now = Date.now();
      const ids = [
        generateTestAgentId(),
        generateTestAgentId(),
        generateTestAgentId(),
      ];

      for (let i = 0; i < 3; i++) {
        await db.insert(s.agents).values({
          id: ids[i],
          userId: testUserId,
          name: `Agent ${i}`,
          systemPrompt: "P",
          toolNames: [],
          skillNames: [],
        });

        // Set distinct updatedAt timestamps
        await db
          .update(s.agents)
          .set({ updatedAt: new Date(now + i * 1000) })
          .where(eq(s.agents.id, ids[i]));
      }

      const result = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.userId, testUserId))
        .orderBy(desc(s.agents.updatedAt));

      expect(result).toHaveLength(3);
      // Most recent first
      expect(result[0].id).toBe(ids[2]);
      expect(result[1].id).toBe(ids[1]);
      expect(result[2].id).toBe(ids[0]);
    });

    it("filters agents by both userId and agentId", async () => {
      const { db } = testDb;
      const s = getSchema();

      const user2 = await createTestUser(testDb);
      const agentId = generateTestAgentId();

      await db.insert(s.agents).values({
        id: agentId,
        userId: testUserId,
        name: "User1 Only",
        systemPrompt: "P",
        toolNames: [],
        skillNames: [],
      });

      // User 1 can find their agent
      const [found] = await db
        .select()
        .from(s.agents)
        .where(and(eq(s.agents.id, agentId), eq(s.agents.userId, testUserId)));
      expect(found).toBeDefined();

      // User 2 cannot find user 1's agent
      const notFound = await db
        .select()
        .from(s.agents)
        .where(and(eq(s.agents.id, agentId), eq(s.agents.userId, user2.id)));
      expect(notFound).toHaveLength(0);
    });

    it("update returns the updated row via .returning()", async () => {
      const { db } = testDb;
      const s = getSchema();

      const [inserted] = await db
        .insert(s.agents)
        .values({
          userId: testUserId,
          name: "Before Update",
          systemPrompt: "P",
          toolNames: [],
          skillNames: [],
        })
        .returning();

      const [updated] = await db
        .update(s.agents)
        .set({ name: "After Update", updatedAt: new Date() })
        .where(eq(s.agents.id, inserted.id))
        .returning();

      expect(updated.name).toBe("After Update");
      expect(updated.id).toBe(inserted.id);
    });

    it("delete returns the deleted row via .returning()", async () => {
      const { db } = testDb;
      const s = getSchema();

      const [inserted] = await db
        .insert(s.agents)
        .values({
          userId: testUserId,
          name: "To Delete",
          systemPrompt: "P",
          toolNames: [],
          skillNames: [],
        })
        .returning();

      const [deleted] = await db
        .delete(s.agents)
        .where(eq(s.agents.id, inserted.id))
        .returning();

      expect(deleted.name).toBe("To Delete");
      expect(deleted.id).toBe(inserted.id);

      // Verify it's actually gone
      const remaining = await db
        .select()
        .from(s.agents)
        .where(eq(s.agents.id, inserted.id));
      expect(remaining).toHaveLength(0);
    });
  });
});
