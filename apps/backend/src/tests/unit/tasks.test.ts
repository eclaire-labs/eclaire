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
      expect(result.data.taskStatus).toBe("open");
      expect(result.data.processingEnabled).toBe(true);
      expect(result.data.tags).toEqual([]);
      expect(result.data.reviewStatus).toBe("none");
      expect(result.data.isPinned).toBe(false);
      expect(result.data.delegateMode).toBe("manual");
      expect(result.data.scheduleType).toBe("none");
      expect(result.data.attentionStatus).toBe("none");
    }
  });

  it("should accept a fully-populated task", () => {
    const result = TaskSchema.safeParse({
      title: "Full Task",
      description: "A complete task",
      taskStatus: "in_progress",
      dueAt: "2026-06-15T09:00:00Z",
      delegateActorId: "user-123",
      delegateMode: "assist",
      processingEnabled: false,
      tags: ["urgent", "backend"],
      reviewStatus: "pending",
      flagColor: "red",
      isPinned: true,
      scheduleType: "recurring",
      scheduleRule: "0 9 * * 1",
      scheduleSummary: "Every Monday at 9 AM",
      maxOccurrences: 10,
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
      taskStatus: "invalid-status",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid status values", () => {
    for (const taskStatus of [
      "open",
      "in_progress",
      "blocked",
      "completed",
      "cancelled",
    ]) {
      const result = TaskSchema.safeParse({ title: "Test", taskStatus });
      expect(result.success, `taskStatus '${taskStatus}' should be valid`).toBe(
        true,
      );
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
    for (const reviewStatus of [
      "none",
      "pending",
      "approved",
      "changes_requested",
    ]) {
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

  it("should accept nullable dueAt", () => {
    const result = TaskSchema.safeParse({ title: "Test", dueAt: null });
    expect(result.success).toBe(true);
  });

  it("should accept all valid delegateMode values", () => {
    for (const delegateMode of ["manual", "assist", "handle"]) {
      const result = TaskSchema.safeParse({ title: "Test", delegateMode });
      expect(
        result.success,
        `delegateMode '${delegateMode}' should be valid`,
      ).toBe(true);
    }
  });

  it("should accept all valid scheduleType values", () => {
    for (const scheduleType of ["none", "one_time", "recurring"]) {
      const result = TaskSchema.safeParse({ title: "Test", scheduleType });
      expect(
        result.success,
        `scheduleType '${scheduleType}' should be valid`,
      ).toBe(true);
    }
  });

  it("should accept nullable scheduleRule", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      scheduleRule: null,
    });
    expect(result.success).toBe(true);
  });

  it("should reject non-integer maxOccurrences", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      maxOccurrences: 5.5,
    });
    expect(result.success).toBe(false);
  });

  it("should reject zero maxOccurrences", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      maxOccurrences: 0,
    });
    expect(result.success).toBe(false);
  });

  it("should accept positive integer maxOccurrences", () => {
    const result = TaskSchema.safeParse({
      title: "Test",
      maxOccurrences: 10,
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

  it("should accept taskStatus-only update", () => {
    const result = PartialTaskSchema.safeParse({ taskStatus: "completed" });
    expect(result.success).toBe(true);
  });

  it("should still reject invalid taskStatus in partial update", () => {
    const result = PartialTaskSchema.safeParse({ taskStatus: "invalid" });
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

  it("should accept valid taskStatus filter", () => {
    const result = TaskSearchParamsSchema.safeParse({
      taskStatus: "completed",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid taskStatus filter", () => {
    const result = TaskSearchParamsSchema.safeParse({ taskStatus: "invalid" });
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
      taskStatus: "in_progress",
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
  });

  it("should reject invalid topLevelOnly value", () => {
    const result = TaskSearchParamsSchema.safeParse({
      topLevelOnly: "yes",
    });
    expect(result.success).toBe(false);
  });

  it("should accept attentionStatus filter", () => {
    const result = TaskSearchParamsSchema.safeParse({
      attentionStatus: "needs_review",
    });
    expect(result.success).toBe(true);
  });

  it("should accept scheduleType filter", () => {
    const result = TaskSearchParamsSchema.safeParse({
      scheduleType: "recurring",
    });
    expect(result.success).toBe(true);
  });

  it("should accept delegateMode filter", () => {
    const result = TaskSearchParamsSchema.safeParse({
      delegateMode: "assist",
    });
    expect(result.success).toBe(true);
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
