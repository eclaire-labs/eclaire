/**
 * @eclaire/queue/core - Progress tracking utilities
 *
 * Helper functions for working with multi-stage job progress.
 * These are pure functions with no external dependencies.
 */

import type { JobStage, JobStageStatus } from "./types.js";

/**
 * Create initial stages array from stage names
 *
 * All stages start with "pending" status and 0 progress.
 *
 * @param names - Array of stage names
 * @returns Array of initialized JobStage objects
 */
export function initializeStages(names: string[]): JobStage[] {
  return names.map((name) => ({
    name,
    status: "pending" as const,
    progress: 0,
  }));
}

/**
 * Calculate overall progress from stages
 *
 * Each stage contributes equally to overall progress.
 * - Pending stages contribute 0%
 * - Processing stages contribute their individual progress
 * - Completed stages contribute 100%
 * - Failed stages contribute their progress at time of failure
 *
 * @param stages - Array of job stages
 * @returns Overall progress percentage (0-100)
 */
export function calculateOverallProgress(stages: JobStage[]): number {
  if (stages.length === 0) return 0;

  const totalProgress = stages.reduce((sum, stage) => {
    if (stage.status === "completed") {
      return sum + 100;
    }
    return sum + stage.progress;
  }, 0);

  return Math.round(totalProgress / stages.length);
}

/**
 * Update a stage in the stages array
 *
 * Returns a new array with the specified stage updated.
 * If the stage doesn't exist, returns the original array unchanged.
 *
 * @param stages - Current stages array
 * @param name - Name of stage to update
 * @param updates - Partial stage updates to apply
 * @returns New stages array with the update applied
 */
export function updateStageInList(
  stages: JobStage[],
  name: string,
  updates: Partial<Omit<JobStage, "name">>,
): JobStage[] {
  return stages.map((stage) =>
    stage.name === name ? { ...stage, ...updates } : stage,
  );
}

/**
 * Find a stage by name
 *
 * @param stages - Array of job stages
 * @param name - Stage name to find
 * @returns The stage or undefined if not found
 */
export function findStage(
  stages: JobStage[],
  name: string,
): JobStage | undefined {
  return stages.find((stage) => stage.name === name);
}

/**
 * Start a stage (set to processing with start time)
 *
 * @param stages - Current stages array
 * @param name - Name of stage to start
 * @returns New stages array with the stage started
 */
export function startStageInList(stages: JobStage[], name: string): JobStage[] {
  return updateStageInList(stages, name, {
    status: "processing",
    startedAt: new Date(),
    progress: 0,
  });
}

/**
 * Complete a stage
 *
 * @param stages - Current stages array
 * @param name - Name of stage to complete
 * @param artifacts - Optional artifacts produced by this stage
 * @returns New stages array with the stage completed
 */
export function completeStageInList(
  stages: JobStage[],
  name: string,
  artifacts?: Record<string, unknown>,
): JobStage[] {
  return updateStageInList(stages, name, {
    status: "completed",
    progress: 100,
    completedAt: new Date(),
    ...(artifacts && { artifacts }),
  });
}

/**
 * Fail a stage
 *
 * @param stages - Current stages array
 * @param name - Name of stage that failed
 * @param error - Error message
 * @returns New stages array with the stage failed
 */
export function failStageInList(
  stages: JobStage[],
  name: string,
  error: string,
): JobStage[] {
  return updateStageInList(stages, name, {
    status: "failed",
    completedAt: new Date(),
    error,
  });
}

/**
 * Update stage progress
 *
 * @param stages - Current stages array
 * @param name - Name of stage to update
 * @param progress - New progress value (0-100)
 * @returns New stages array with the progress updated
 */
export function updateStageProgressInList(
  stages: JobStage[],
  name: string,
  progress: number,
): JobStage[] {
  return updateStageInList(stages, name, {
    progress: Math.max(0, Math.min(100, progress)),
  });
}

/**
 * Add stages to an existing list
 *
 * New stages are appended with "pending" status.
 *
 * @param existingStages - Current stages array
 * @param newStageNames - Names of stages to add
 * @returns New stages array with additions
 */
export function addStagesToList(
  existingStages: JobStage[],
  newStageNames: string[],
): JobStage[] {
  const newStages = initializeStages(newStageNames);
  return [...existingStages, ...newStages];
}

/**
 * Get the current stage (first non-completed, non-failed stage)
 *
 * @param stages - Array of job stages
 * @returns The current stage name, or undefined if all complete/failed
 */
export function getCurrentStageName(stages: JobStage[]): string | undefined {
  const current = stages.find(
    (stage) => stage.status === "processing" || stage.status === "pending",
  );
  return current?.name;
}

/**
 * Check if all stages are completed
 *
 * @param stages - Array of job stages
 * @returns true if all stages have "completed" status
 */
export function areAllStagesCompleted(stages: JobStage[]): boolean {
  return stages.length > 0 && stages.every((stage) => stage.status === "completed");
}

/**
 * Check if any stage has failed
 *
 * @param stages - Array of job stages
 * @returns true if any stage has "failed" status
 */
export function hasFailedStage(stages: JobStage[]): boolean {
  return stages.some((stage) => stage.status === "failed");
}
