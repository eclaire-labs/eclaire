/**
 * Unit tests for core/progress.ts utility functions
 *
 * These are pure functions with no external dependencies,
 * testing multi-stage job progress tracking utilities.
 */

import { describe, it, expect } from "vitest";
import {
  initializeStages,
  calculateOverallProgress,
  updateStageInList,
  findStage,
  startStageInList,
  completeStageInList,
  failStageInList,
  updateStageProgressInList,
  addStagesToList,
  getCurrentStageName,
  areAllStagesCompleted,
  hasFailedStage,
} from "../../core/progress.js";
import type { JobStage } from "../../core/types.js";

describe("initializeStages", () => {
  it("creates stages with pending status and 0 progress", () => {
    const stages = initializeStages(["validation", "processing", "finalize"]);

    expect(stages).toHaveLength(3);
    expect(stages[0]).toEqual({
      name: "validation",
      status: "pending",
      progress: 0,
    });
    expect(stages[1]).toEqual({
      name: "processing",
      status: "pending",
      progress: 0,
    });
    expect(stages[2]).toEqual({
      name: "finalize",
      status: "pending",
      progress: 0,
    });
  });

  it("handles empty array", () => {
    const stages = initializeStages([]);
    expect(stages).toEqual([]);
  });

  it("handles single stage", () => {
    const stages = initializeStages(["only-stage"]);
    expect(stages).toHaveLength(1);
    expect(stages[0].name).toBe("only-stage");
    expect(stages[0].status).toBe("pending");
  });
});

describe("calculateOverallProgress", () => {
  it("returns 0 for empty array", () => {
    expect(calculateOverallProgress([])).toBe(0);
  });

  it("returns 0 for all pending stages", () => {
    const stages = initializeStages(["a", "b", "c"]);
    expect(calculateOverallProgress(stages)).toBe(0);
  });

  it("returns 100 for all completed stages", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "completed", progress: 100 },
      { name: "c", status: "completed", progress: 100 },
    ];
    expect(calculateOverallProgress(stages)).toBe(100);
  });

  it("uses progress value for processing stages", () => {
    const stages: JobStage[] = [
      { name: "a", status: "processing", progress: 50 },
    ];
    expect(calculateOverallProgress(stages)).toBe(50);
  });

  it("uses progress value for failed stages", () => {
    const stages: JobStage[] = [
      { name: "a", status: "failed", progress: 30, error: "failed" },
    ];
    expect(calculateOverallProgress(stages)).toBe(30);
  });

  it("calculates average across mixed stages", () => {
    // 1 completed (100), 1 at 50%, 1 pending (0) = (100+50+0)/3 = 50
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "processing", progress: 50 },
      { name: "c", status: "pending", progress: 0 },
    ];
    expect(calculateOverallProgress(stages)).toBe(50);
  });

  it("rounds the result", () => {
    // (100 + 0) / 2 = 50 (no rounding needed)
    // (100 + 33) / 2 = 66.5 -> 67
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "processing", progress: 33 },
    ];
    expect(calculateOverallProgress(stages)).toBe(67);
  });
});

describe("updateStageInList", () => {
  it("updates the specified stage", () => {
    const stages = initializeStages(["a", "b"]);
    const updated = updateStageInList(stages, "a", { status: "processing" });

    expect(updated[0].status).toBe("processing");
    expect(updated[1].status).toBe("pending");
  });

  it("returns original array if stage not found", () => {
    const stages = initializeStages(["a", "b"]);
    const updated = updateStageInList(stages, "nonexistent", {
      status: "completed",
    });

    expect(updated).toEqual(stages);
  });

  it("does not mutate original array", () => {
    const stages = initializeStages(["a"]);
    const updated = updateStageInList(stages, "a", { progress: 50 });

    expect(stages[0].progress).toBe(0);
    expect(updated[0].progress).toBe(50);
  });
});

describe("findStage", () => {
  it("finds stage by name", () => {
    const stages = initializeStages(["a", "b", "c"]);
    const found = findStage(stages, "b");

    expect(found).toBeDefined();
    expect(found?.name).toBe("b");
  });

  it("returns undefined if not found", () => {
    const stages = initializeStages(["a", "b"]);
    const found = findStage(stages, "nonexistent");

    expect(found).toBeUndefined();
  });
});

describe("startStageInList", () => {
  it("sets status to processing", () => {
    const stages = initializeStages(["validation"]);
    const updated = startStageInList(stages, "validation");

    expect(updated[0].status).toBe("processing");
  });

  it("sets startedAt timestamp", () => {
    const before = new Date();
    const stages = initializeStages(["validation"]);
    const updated = startStageInList(stages, "validation");
    const after = new Date();

    expect(updated[0].startedAt).toBeInstanceOf(Date);
    expect(updated[0].startedAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(updated[0].startedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("resets progress to 0", () => {
    const stages: JobStage[] = [{ name: "a", status: "pending", progress: 50 }];
    const updated = startStageInList(stages, "a");

    expect(updated[0].progress).toBe(0);
  });
});

describe("completeStageInList", () => {
  it("sets status to completed", () => {
    const stages = initializeStages(["validation"]);
    const updated = completeStageInList(stages, "validation");

    expect(updated[0].status).toBe("completed");
  });

  it("sets progress to 100", () => {
    const stages: JobStage[] = [
      { name: "a", status: "processing", progress: 50 },
    ];
    const updated = completeStageInList(stages, "a");

    expect(updated[0].progress).toBe(100);
  });

  it("sets completedAt timestamp", () => {
    const before = new Date();
    const stages = initializeStages(["validation"]);
    const updated = completeStageInList(stages, "validation");
    const after = new Date();

    expect(updated[0].completedAt).toBeInstanceOf(Date);
    expect(updated[0].completedAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(updated[0].completedAt!.getTime()).toBeLessThanOrEqual(
      after.getTime()
    );
  });

  it("stores artifacts when provided", () => {
    const stages = initializeStages(["validation"]);
    const updated = completeStageInList(stages, "validation", {
      fileCount: 5,
      processed: true,
    });

    expect(updated[0].artifacts).toEqual({ fileCount: 5, processed: true });
  });

  it("does not add artifacts field when not provided", () => {
    const stages = initializeStages(["validation"]);
    const updated = completeStageInList(stages, "validation");

    expect(updated[0].artifacts).toBeUndefined();
  });
});

describe("failStageInList", () => {
  it("sets status to failed", () => {
    const stages = initializeStages(["validation"]);
    const updated = failStageInList(stages, "validation", "Connection timeout");

    expect(updated[0].status).toBe("failed");
  });

  it("sets completedAt timestamp", () => {
    const before = new Date();
    const stages = initializeStages(["validation"]);
    const updated = failStageInList(stages, "validation", "Error");
    const after = new Date();

    expect(updated[0].completedAt).toBeInstanceOf(Date);
    expect(updated[0].completedAt!.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(updated[0].completedAt!.getTime()).toBeLessThanOrEqual(
      after.getTime()
    );
  });

  it("stores error message", () => {
    const stages = initializeStages(["validation"]);
    const updated = failStageInList(stages, "validation", "Connection timeout");

    expect(updated[0].error).toBe("Connection timeout");
  });

  it("preserves progress at time of failure", () => {
    const stages: JobStage[] = [
      { name: "a", status: "processing", progress: 75 },
    ];
    const updated = failStageInList(stages, "a", "Failed at 75%");

    expect(updated[0].progress).toBe(75);
    expect(updated[0].status).toBe("failed");
  });
});

describe("updateStageProgressInList", () => {
  it("updates progress value", () => {
    const stages: JobStage[] = [
      { name: "a", status: "processing", progress: 0 },
    ];
    const updated = updateStageProgressInList(stages, "a", 50);

    expect(updated[0].progress).toBe(50);
  });

  it("clamps progress to minimum 0", () => {
    const stages: JobStage[] = [
      { name: "a", status: "processing", progress: 50 },
    ];
    const updated = updateStageProgressInList(stages, "a", -10);

    expect(updated[0].progress).toBe(0);
  });

  it("clamps progress to maximum 100", () => {
    const stages: JobStage[] = [
      { name: "a", status: "processing", progress: 50 },
    ];
    const updated = updateStageProgressInList(stages, "a", 150);

    expect(updated[0].progress).toBe(100);
  });

  it("allows exact boundary values", () => {
    const stages: JobStage[] = [
      { name: "a", status: "processing", progress: 50 },
    ];

    expect(updateStageProgressInList(stages, "a", 0)[0].progress).toBe(0);
    expect(updateStageProgressInList(stages, "a", 100)[0].progress).toBe(100);
  });
});

describe("addStagesToList", () => {
  it("appends new stages with pending status", () => {
    const existing = initializeStages(["a"]);
    const updated = addStagesToList(existing, ["b", "c"]);

    expect(updated).toHaveLength(3);
    expect(updated[1].name).toBe("b");
    expect(updated[1].status).toBe("pending");
    expect(updated[1].progress).toBe(0);
    expect(updated[2].name).toBe("c");
    expect(updated[2].status).toBe("pending");
  });

  it("preserves existing stages unchanged", () => {
    const existing: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
    ];
    const updated = addStagesToList(existing, ["b"]);

    expect(updated[0]).toEqual(existing[0]);
  });

  it("handles empty new stages array", () => {
    const existing = initializeStages(["a"]);
    const updated = addStagesToList(existing, []);

    expect(updated).toHaveLength(1);
  });

  it("handles empty existing stages", () => {
    const updated = addStagesToList([], ["a", "b"]);

    expect(updated).toHaveLength(2);
    expect(updated[0].name).toBe("a");
  });
});

describe("getCurrentStageName", () => {
  it("returns first processing stage", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "processing", progress: 50 },
      { name: "c", status: "pending", progress: 0 },
    ];

    expect(getCurrentStageName(stages)).toBe("b");
  });

  it("returns first pending if none processing", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "pending", progress: 0 },
      { name: "c", status: "pending", progress: 0 },
    ];

    expect(getCurrentStageName(stages)).toBe("b");
  });

  it("returns undefined when all completed", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "completed", progress: 100 },
    ];

    expect(getCurrentStageName(stages)).toBeUndefined();
  });

  it("returns undefined when all failed", () => {
    const stages: JobStage[] = [
      { name: "a", status: "failed", progress: 50, error: "error" },
    ];

    expect(getCurrentStageName(stages)).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(getCurrentStageName([])).toBeUndefined();
  });
});

describe("areAllStagesCompleted", () => {
  it("returns true when all completed", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "completed", progress: 100 },
    ];

    expect(areAllStagesCompleted(stages)).toBe(true);
  });

  it("returns false when any pending", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "pending", progress: 0 },
    ];

    expect(areAllStagesCompleted(stages)).toBe(false);
  });

  it("returns false when any processing", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "processing", progress: 50 },
    ];

    expect(areAllStagesCompleted(stages)).toBe(false);
  });

  it("returns false when any failed", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "failed", progress: 50, error: "error" },
    ];

    expect(areAllStagesCompleted(stages)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(areAllStagesCompleted([])).toBe(false);
  });
});

describe("hasFailedStage", () => {
  it("returns true when any stage failed", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "failed", progress: 50, error: "error" },
    ];

    expect(hasFailedStage(stages)).toBe(true);
  });

  it("returns false when no failed stages", () => {
    const stages: JobStage[] = [
      { name: "a", status: "completed", progress: 100 },
      { name: "b", status: "processing", progress: 50 },
      { name: "c", status: "pending", progress: 0 },
    ];

    expect(hasFailedStage(stages)).toBe(false);
  });

  it("returns false for empty array", () => {
    expect(hasFailedStage([])).toBe(false);
  });
});
