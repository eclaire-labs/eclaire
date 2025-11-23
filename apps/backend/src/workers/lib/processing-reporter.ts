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

import { getServiceRole } from "../../lib/env-validation";

// Re-export types from HTTP version (both implementations have identical types)
export type {
  AssetType,
  ProcessingStatus,
  ProcessingEvent,
} from "./processing-reporter-http";

// Re-export the ProcessingReporter type interface
export type { ProcessingReporter } from "./processing-reporter-http";

/**
 * Factory function that creates the appropriate ProcessingReporter based on deployment mode
 * @param jobType Optional job type for tasks with multiple processing pipelines (tag_generation, execution)
 */
export function createProcessingReporter(
  assetType: "photos" | "documents" | "bookmarks" | "notes" | "tasks",
  assetId: string,
  userId: string,
  jobType?: string,
) {
  const serviceRole = getServiceRole();

  if (serviceRole === "unified") {
    // Unified mode: Same container as backend
    // Use direct DB access + SSE publishing (no network overhead)
    const {
      createProcessingReporter: createDirect,
    } = require("../../lib/processing-reporter-direct");
    return createDirect(assetType, assetId, userId, jobType);
  } else {
    // Worker mode: Separate container from backend
    // Use HTTP API + Redis pub/sub for communication
    const {
      createProcessingReporter: createHttp,
    } = require("./processing-reporter-http");
    return createHttp(assetType, assetId, userId, jobType);
  }
}
