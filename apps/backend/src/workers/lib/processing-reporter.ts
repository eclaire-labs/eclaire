/**
 * Unified Processing Reporter Factory
 *
 * This factory automatically selects the appropriate processing reporter implementation
 * based on the SERVICE_ROLE environment variable:
 *
 * - SERVICE_ROLE=unified: Uses ProcessingReporterDirect (direct DB + SSE, no network calls)
 * - SERVICE_ROLE=worker: Uses ProcessingReporterHttp (HTTP API + Redis pub/sub)
 *
 * This allows workers to run optimally in both deployment modes:
 * 1. Unified mode (same container as backend): Direct DB access, no HTTP overhead
 * 2. Separate worker mode (separate container): HTTP communication with backend
 */

import { getServiceRole } from "../../lib/env-validation.js";
import type { IProcessingReporter } from "./processing-reporter-interface.js";

// Re-export types from the shared interface
export type {
  AssetType,
  ProcessingStatus,
  ProcessingEvent,
  IProcessingReporter,
} from "./processing-reporter-interface.js";

// Re-export IProcessingReporter as ProcessingReporter for backwards compatibility
export type { IProcessingReporter as ProcessingReporter } from "./processing-reporter-interface.js";

/**
 * Factory function that creates the appropriate ProcessingReporter based on deployment mode
 * Uses dynamic import() for ESM compatibility while maintaining runtime module selection.
 * @param jobType Optional job type for tasks with multiple processing pipelines (tag_generation, execution)
 */
export async function createProcessingReporter(
  assetType: "photos" | "documents" | "bookmarks" | "notes" | "tasks",
  assetId: string,
  userId: string,
  jobType?: string,
): Promise<IProcessingReporter> {
  const serviceRole = getServiceRole();

  if (serviceRole === "unified") {
    // Unified mode: Same container as backend
    // Use direct DB access + SSE publishing (no network overhead)
    const { createProcessingReporter: createDirect } = await import(
      "../../lib/processing-reporter-direct.js"
    );
    return createDirect(assetType, assetId, userId, jobType);
  } else {
    // Worker mode: Separate container from backend
    // Use HTTP API + Redis pub/sub for communication
    const { createProcessingReporter: createHttp } = await import(
      "./processing-reporter-http.js"
    );
    return createHttp(assetType, assetId, userId);
  }
}
