import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestActor,
  createTestConversation,
  createTestMessage,
  createTestUser,
  DB_TEST_CONFIGS,
  generateTestAgentStepId,
  initTestDatabase,
  type TestDatabase,
} from "./setup.js";

describe.each(DB_TEST_CONFIGS)("$label - Agent Steps DB Integration Tests", ({
  dbType,
}) => {
  let testDb: TestDatabase;
  let testUserId: string;
  let testConversationId: string;
  let testMessageId: string;

  beforeEach(async () => {
    testDb = await initTestDatabase(dbType);

    // Build the full FK chain: user -> actor -> conversation -> message
    const user = await createTestUser(testDb);
    testUserId = user.id;

    const actor = await createTestActor(testDb, testUserId, {
      kind: "agent",
      displayName: "Test Agent",
    });

    const conversation = await createTestConversation(
      testDb,
      testUserId,
      actor.id,
    );
    testConversationId = conversation.id;

    const message = await createTestMessage(testDb, testConversationId, {
      role: "assistant",
      content: "Hello!",
    });
    testMessageId = message.id;
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
  // FK Constraints
  // -----------------------------------------------------------------------
  describe("FK Constraints", () => {
    it("inserts an agent step with valid messageId and conversationId", async () => {
      const { db } = testDb;
      const s = getSchema();
      const stepId = generateTestAgentStepId();

      await db.insert(s.agentSteps).values({
        id: stepId,
        messageId: testMessageId,
        conversationId: testConversationId,
        stepNumber: 1,
        timestamp: new Date(),
        textContent: "Step 1 output",
        isTerminal: false,
      });

      const [step] = await db
        .select()
        .from(s.agentSteps)
        .where(eq(s.agentSteps.id, stepId));

      expect(step).toBeDefined();
      expect(step.messageId).toBe(testMessageId);
      expect(step.conversationId).toBe(testConversationId);
      expect(step.stepNumber).toBe(1);
      expect(step.textContent).toBe("Step 1 output");
    });

    it("rejects insert when messageId references a non-existent message", async () => {
      const { db } = testDb;
      const s = getSchema();

      await expect(
        db.insert(s.agentSteps).values({
          messageId: "msg-nonexistent",
          conversationId: testConversationId,
          stepNumber: 1,
          timestamp: new Date(),
        }),
      ).rejects.toThrow();
    });

    it("rejects insert when conversationId references a non-existent conversation", async () => {
      const { db } = testDb;
      const s = getSchema();

      await expect(
        db.insert(s.agentSteps).values({
          messageId: testMessageId,
          conversationId: "conv-nonexistent",
          stepNumber: 1,
          timestamp: new Date(),
        }),
      ).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Cascade Deletes
  // -----------------------------------------------------------------------
  describe("Cascade Deletes", () => {
    it("deletes agent steps when the parent message is deleted", async () => {
      const { db } = testDb;
      const s = getSchema();

      // Insert 3 steps for the message
      for (let i = 1; i <= 3; i++) {
        await db.insert(s.agentSteps).values({
          messageId: testMessageId,
          conversationId: testConversationId,
          stepNumber: i,
          timestamp: new Date(),
          textContent: `Step ${i}`,
        });
      }

      const before = await db
        .select()
        .from(s.agentSteps)
        .where(eq(s.agentSteps.messageId, testMessageId));
      expect(before).toHaveLength(3);

      // Delete the message
      await db.delete(s.messages).where(eq(s.messages.id, testMessageId));

      const after = await db
        .select()
        .from(s.agentSteps)
        .where(eq(s.agentSteps.messageId, testMessageId));
      expect(after).toHaveLength(0);
    });

    it("deletes agent steps when the parent conversation is deleted", async () => {
      const { db } = testDb;
      const s = getSchema();

      await db.insert(s.agentSteps).values({
        messageId: testMessageId,
        conversationId: testConversationId,
        stepNumber: 1,
        timestamp: new Date(),
      });

      // Delete the conversation (cascades through messages)
      await db
        .delete(s.conversations)
        .where(eq(s.conversations.id, testConversationId));

      const steps = await db.select().from(s.agentSteps);
      expect(steps).toHaveLength(0);

      // Messages should also be gone
      const messages = await db
        .select()
        .from(s.messages)
        .where(eq(s.messages.conversationId, testConversationId));
      expect(messages).toHaveLength(0);
    });

    it("deletes agent steps when the owning user is deleted (full cascade)", async () => {
      const { db } = testDb;
      const s = getSchema();

      await db.insert(s.agentSteps).values({
        messageId: testMessageId,
        conversationId: testConversationId,
        stepNumber: 1,
        timestamp: new Date(),
      });

      // Delete the user — should cascade: user -> conversation -> message -> steps
      await db.delete(s.users).where(eq(s.users.id, testUserId));

      const steps = await db.select().from(s.agentSteps);
      expect(steps).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // JSON Column: toolExecutions
  // -----------------------------------------------------------------------
  describe("JSON Column: toolExecutions", () => {
    it("stores and retrieves complex toolExecutions JSON", async () => {
      const { db } = testDb;
      const s = getSchema();

      const toolExecutions = [
        {
          callId: "call_1",
          toolName: "findContent",
          input: { query: "test", filters: { tags: ["dev", "docs"] } },
          result: { items: [{ id: "bm-1", title: "Result" }] },
          success: true,
          durationMs: 150,
        },
        {
          callId: "call_2",
          toolName: "sendEmail",
          input: { to: "user@example.com", subject: "Hi" },
          result: { sent: true },
          success: true,
          durationMs: 300,
        },
      ];

      const stepId = generateTestAgentStepId();
      await db.insert(s.agentSteps).values({
        id: stepId,
        messageId: testMessageId,
        conversationId: testConversationId,
        stepNumber: 1,
        timestamp: new Date(),
        toolExecutions,
      });

      const [step] = await db
        .select()
        .from(s.agentSteps)
        .where(eq(s.agentSteps.id, stepId));

      expect(step.toolExecutions).toEqual(toolExecutions);
    });

    it("handles null toolExecutions", async () => {
      const { db } = testDb;
      const s = getSchema();

      const stepId = generateTestAgentStepId();
      await db.insert(s.agentSteps).values({
        id: stepId,
        messageId: testMessageId,
        conversationId: testConversationId,
        stepNumber: 1,
        timestamp: new Date(),
        toolExecutions: null,
      });

      const [step] = await db
        .select()
        .from(s.agentSteps)
        .where(eq(s.agentSteps.id, stepId));

      expect(step.toolExecutions).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Query Ordering
  // -----------------------------------------------------------------------
  describe("Query Ordering", () => {
    it("retrieves steps ordered by stepNumber ascending", async () => {
      const { db } = testDb;
      const s = getSchema();

      // Insert out of order
      const stepNumbers = [3, 1, 5, 2, 4];
      for (const num of stepNumbers) {
        await db.insert(s.agentSteps).values({
          messageId: testMessageId,
          conversationId: testConversationId,
          stepNumber: num,
          timestamp: new Date(),
          textContent: `Step ${num}`,
        });
      }

      const result = await db
        .select()
        .from(s.agentSteps)
        .where(eq(s.agentSteps.messageId, testMessageId))
        .orderBy(asc(s.agentSteps.stepNumber));

      expect(result).toHaveLength(5);
      expect(result.map((s) => s.stepNumber)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  // -----------------------------------------------------------------------
  // Multi-Message Isolation
  // -----------------------------------------------------------------------
  describe("Multi-Message Isolation", () => {
    it("steps from different messages do not mix", async () => {
      const { db } = testDb;
      const s = getSchema();

      // Create a second message in the same conversation
      const message2 = await createTestMessage(testDb, testConversationId, {
        role: "assistant",
        content: "Second response",
      });

      // Insert 2 steps for message 1
      for (let i = 1; i <= 2; i++) {
        await db.insert(s.agentSteps).values({
          messageId: testMessageId,
          conversationId: testConversationId,
          stepNumber: i,
          timestamp: new Date(),
          textContent: `Msg1 Step ${i}`,
        });
      }

      // Insert 2 steps for message 2
      for (let i = 1; i <= 2; i++) {
        await db.insert(s.agentSteps).values({
          messageId: message2.id,
          conversationId: testConversationId,
          stepNumber: i,
          timestamp: new Date(),
          textContent: `Msg2 Step ${i}`,
        });
      }

      // Query for message 1 only
      const msg1Steps = await db
        .select()
        .from(s.agentSteps)
        .where(eq(s.agentSteps.messageId, testMessageId));

      expect(msg1Steps).toHaveLength(2);
      expect(msg1Steps.every((s) => s.messageId === testMessageId)).toBe(true);

      // Query for message 2 only
      const msg2Steps = await db
        .select()
        .from(s.agentSteps)
        .where(eq(s.agentSteps.messageId, message2.id));

      expect(msg2Steps).toHaveLength(2);
      expect(msg2Steps.every((s) => s.messageId === message2.id)).toBe(true);
    });
  });
});
