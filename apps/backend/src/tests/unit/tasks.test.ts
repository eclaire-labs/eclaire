import { describe, expect, it } from "vitest";
import {
  PartialTaskSchema,
  TaskCommentCreateSchema,
  TaskCommentUpdateSchema,
  TaskSchema,
  TaskSearchParamsSchema,
} from "../../schemas/tasks-params.js";

// ---------------------------------------------------------------------------
// TaskSchema — Full task creation/update validation
// ---------------------------------------------------------------------------

describe("TaskSchema", () => {
  it("should accept a minimal valid task (title only)", () => {
    const result = TaskSchema.safeParse({ title: "Buy groceries" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Buy groceries");
      expect(result.data.status).toBe("open");
      expect(result.data.processingEnabled).toBe(true);
      expect(result.data.tags).toEqual([]);
      expect(result.data.reviewStatus).toBe("pending");
      expect(result.data.isPinned).toBe(false);
      expect(result.data.isRecurring).toBe(false);
      expect(result.data.runImmediately).toBe(false);
    }
  });

  it("should accept a fully-populated task", () => {
    const result = TaskSchema.safeParse({
      title: "Full Task",
      description: "A complete task",
      status: "in-progress",
      dueDate: "2026-06-15T09:00:00Z",
      assigneeActorId: "user-123",
      processingEnabled: false,
      tags: ["urgent", "backend"],
      reviewStatus: "accepted",
      flagColor: "red",
      isPinned: true,
      isRecurring: true,
      cronExpression: "0 9 * * 1",
      recurrenceEndDate: "2026-12-31T23:59:59Z",
      recurrenceLimit: 10,
      runImmediately: true,
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty title", () => {
    const result = TaskSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("should reject missing title", () => {
    const result = TaskSchema.safeParse({
      description: "No title provided",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid status", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      status: "invalid-status",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid status values", () => {
    for (const status of [
      "backlog",
      "open",
      "in-progress",
      "completed",
      "cancelled",
    ]) {
      const result = TaskSchema.safeParse({ title: "Test", status });
      expect(result.success, `status '${status}' should be valid`).toBe(true);
    }
  });

  it("should accept parentId as string or null", () => {
    const withString = TaskSchema.safeParse({
      title: "Test",
      parentId: "tsk_abc123",
    });
    expect(withString.success).toBe(true);

    const withNull = TaskSchema.safeParse({
      title: "Test",
      parentId: null,
    });
    expect(withNull.success).toBe(true);
  });

  it("should accept priority values 0-4", () => {
    for (const priority of [0, 1, 2, 3, 4]) {
      const result = TaskSchema.safeParse({ title: "Test", priority });
      expect(result.success, `priority ${priority} should be valid`).toBe(true);
    }
  });

  it("should reject priority values outside 0-4", () => {
    expect(TaskSchema.safeParse({ title: "Test", priority: -1 }).success).toBe(
      false,
    );
    expect(TaskSchema.safeParse({ title: "Test", priority: 5 }).success).toBe(
      false,
    );
  });

  it("should accept sortOrder as number or null", () => {
    const withNumber = TaskSchema.safeParse({
      title: "Test",
      sortOrder: 1.5,
    });
    expect(withNumber.success).toBe(true);

    const withNull = TaskSchema.safeParse({
      title: "Test",
      sortOrder: null,
    });
    expect(withNull.success).toBe(true);
  });

  it("should reject invalid reviewStatus", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      reviewStatus: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid reviewStatus values", () => {
    for (const reviewStatus of ["pending", "accepted", "rejected"]) {
      const result = TaskSchema.safeParse({ title: "Test", reviewStatus });
      expect(
        result.success,
        `reviewStatus '${reviewStatus}' should be valid`,
      ).toBe(true);
    }
  });

  it("should reject invalid flagColor", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      flagColor: "purple",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid flagColor values", () => {
    for (const flagColor of ["red", "yellow", "orange", "green", "blue"]) {
      const result = TaskSchema.safeParse({ title: "Test", flagColor });
      expect(result.success, `flagColor '${flagColor}' should be valid`).toBe(
        true,
      );
    }
  });

  it("should accept nullable description", () => {
    const result = TaskSchema.safeParse({ title: "Test", description: null });
    expect(result.success).toBe(true);
  });

  it("should accept nullable dueDate", () => {
    const result = TaskSchema.safeParse({ title: "Test", dueDate: null });
    expect(result.success).toBe(true);
  });

  it("should accept nullable cronExpression", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      cronExpression: null,
    });
    expect(result.success).toBe(true);
  });

  it("should reject non-integer recurrenceLimit", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      recurrenceLimit: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it("should reject zero recurrenceLimit", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      recurrenceLimit: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should reject negative recurrenceLimit", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      recurrenceLimit: -1,
    });
    expect(result.success).toBe(false);
  });

  it("should accept positive integer recurrenceLimit", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      recurrenceLimit: 10,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PartialTaskSchema — Partial update validation
// ---------------------------------------------------------------------------

describe("PartialTaskSchema", () => {
  it("should accept empty object (all fields optional)", () => {
    const result = PartialTaskSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept title-only update", () => {
    const result = PartialTaskSchema.safeParse({ title: "New Title" });
    expect(result.success).toBe(true);
  });

  it("should accept status-only update", () => {
    const result = PartialTaskSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(true);
  });

  it("should still reject invalid status in partial update", () => {
    const result = PartialTaskSchema.safeParse({ status: "invalid" });
    expect(result.success).toBe(false);
  });

  it("should still reject empty title in partial update", () => {
    const result = PartialTaskSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("should accept multiple fields together", () => {
    const result = PartialTaskSchema.safeParse({
      title: "Updated",
      isPinned: true,
      tags: ["new-tag"],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TaskSearchParamsSchema — Query parameter validation
// ---------------------------------------------------------------------------

describe("TaskSearchParamsSchema", () => {
  it("should accept empty params (all optional)", () => {
    const result = TaskSearchParamsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50); // default
    }
  });

  it("should accept text search", () => {
    const result = TaskSearchParamsSchema.safeParse({ text: "urgent" });
    expect(result.success).toBe(true);
  });

  it("should accept comma-separated tags", () => {
    const result = TaskSearchParamsSchema.safeParse({ tags: "urgent,backend" });
    expect(result.success).toBe(true);
  });

  it("should accept valid status filter", () => {
    const result = TaskSearchParamsSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(true);
  });

  it("should reject invalid status filter", () => {
    const result = TaskSearchParamsSchema.safeParse({ status: "invalid" });
    expect(result.success).toBe(false);
  });

  it("should coerce string limit to number", () => {
    const result = TaskSearchParamsSchema.safeParse({ limit: "25" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it("should reject limit below 1", () => {
    const result = TaskSearchParamsSchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  it("should reject negative limit", () => {
    const result = TaskSearchParamsSchema.safeParse({ limit: "-1" });
    expect(result.success).toBe(false);
  });

  it("should accept date range params", () => {
    const result = TaskSearchParamsSchema.safeParse({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    expect(result.success).toBe(true);
  });

  it("should accept due date range params", () => {
    const result = TaskSearchParamsSchema.safeParse({
      dueDateStart: "2026-06-01",
      dueDateEnd: "2026-06-30",
    });
    expect(result.success).toBe(true);
  });

  it("should accept combined filters", () => {
    const result = TaskSearchParamsSchema.safeParse({
      text: "meeting",
      status: "in-progress",
      tags: "urgent",
      limit: "10",
    });
    expect(result.success).toBe(true);
  });

  it("should accept parentId filter", () => {
    const result = TaskSearchParamsSchema.safeParse({
      parentId: "tsk_abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBe("tsk_abc123");
    }
  });

  it("should accept topLevelOnly filter", () => {
    const trueResult = TaskSearchParamsSchema.safeParse({
      topLevelOnly: "true",
    });
    expect(trueResult.success).toBe(true);
    if (trueResult.success) {
      expect(trueResult.data.topLevelOnly).toBe("true");
    }

    const falseResult = TaskSearchParamsSchema.safeParse({
      topLevelOnly: "false",
    });
    expect(falseResult.success).toBe(true);
  });

  it("should reject invalid topLevelOnly value", () => {
    const result = TaskSearchParamsSchema.safeParse({
      topLevelOnly: "yes",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TaskCommentCreateSchema — Comment creation validation
// ---------------------------------------------------------------------------

describe("TaskCommentCreateSchema", () => {
  it("should accept valid comment content", () => {
    const result = TaskCommentCreateSchema.safeParse({
      content: "This is a comment.",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty content", () => {
    const result = TaskCommentCreateSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });

  it("should reject missing content", () => {
    const result = TaskCommentCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TaskCommentUpdateSchema — Comment update validation
// ---------------------------------------------------------------------------

describe("TaskCommentUpdateSchema", () => {
  it("should accept valid updated content", () => {
    const result = TaskCommentUpdateSchema.safeParse({
      content: "Updated comment.",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty content", () => {
    const result = TaskCommentUpdateSchema.safeParse({ content: "" });
    expect(result.success).toBe(false);
  });
});
