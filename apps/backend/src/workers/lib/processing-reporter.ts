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

// Re-export types from HTTP version (both implementations have identical types)
export type {
  AssetType,
  ProcessingStatus,
  ProcessingEvent,
} from "./processing-reporter-http.js";

// Re-export the ProcessingReporter type interface
export type { ProcessingReporter } from "./processing-reporter-http.js";

// Import the type for use in return type annotation
import type { ProcessingReporter } from "./processing-reporter-http.js";

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
): Promise<ProcessingReporter> {
  const serviceRole = getServiceRole();

  if (serviceRole === "unified") {
    // Unified mode: Same container as backend
    // Use direct DB access + SSE publishing (no network overhead)
    const { createProcessingReporter: createDirect } = await import(
      "../../lib/processing-reporter-direct.js"
    );
    // Cast through unknown since both implementations have the same public API
    // but different internal structures (apiBaseUrl vs direct DB access)
    return createDirect(assetType, assetId, userId, jobType) as unknown as ProcessingReporter;
  } else {
    // Worker mode: Separate container from backend
    // Use HTTP API + Redis pub/sub for communication
    const { createProcessingReporter: createHttp } = await import(
      "./processing-reporter-http.js"
    );
    return createHttp(assetType, assetId, userId);
  }
}
