import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import { createChildLogger } from "../lib/logger.js";
import {
  getProcessingJob,
  getUserProcessingJobs,
  getUserProcessingSummary,
  retryAssetProcessing,
  updateProcessingStatusWithArtifacts,
} from "../lib/services/processing-status.js";
import { assetTypeSchema, ASSET_TYPES } from "../schemas/asset-types.js";
import {
  AssetRetryBodySchema,
  RetryBodySchema,
  UpdateStatusBodySchema,
} from "../schemas/processing-status-params.js";
import {
  getAssetProcessingStatusRouteDescription,
  getProcessingJobsRouteDescription,
  getProcessingStatusSummaryRouteDescription,
  postAssetProcessingRetryRouteDescription,
  postProcessingRetryRouteDescription,
  putAssetProcessingStatusUpdateRouteDescription,
} from "../schemas/processing-status-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("processing-status-routes");

export const processingStatusRoutes = new Hono<{ Variables: RouteVariables }>();

/**
 * GET /api/processing-status/summary
 * (No changes to this route)
 */
processingStatusRoutes.get(
  "/summary",
  describeRoute(getProcessingStatusSummaryRouteDescription),
  async (c) => {
    // ... (code is unchanged)
    const requestId = c.get("requestId");

    // logger.info(
    //   { requestId, path: "/summary", method: "GET" },
    //   "Processing summary route called",
    // );

    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const summary = await getUserProcessingSummary(userId);
      return c.json(summary);
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error getting user processing summary",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

/**
 * GET /api/processing-status/jobs
 * (No changes to this route)
 */
processingStatusRoutes.get(
  "/jobs",
  describeRoute(getProcessingJobsRouteDescription),
  async (c) => {
    // ... (code is unchanged)
    const requestId = c.get("requestId");

    logger.info(
      { requestId, path: "/jobs", method: "GET" },
      "Processing jobs route called",
    );

    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const status = c.req.query("status");
      const assetType = c.req.query("assetType");
      const search = c.req.query("search");
      const limit = parseInt(c.req.query("limit") || "100");
      const offset = parseInt(c.req.query("offset") || "0");

      const jobs = await getUserProcessingJobs(userId, {
        status: status as any,
        assetType: assetType as any,
        search,
        limit,
        offset,
      });

      return c.json(jobs);
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error getting user processing jobs",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

/**
 * GET /api/processing-status/:assetType/:assetId
 * (No changes to this route)
 */
processingStatusRoutes.get(
  "/:assetType/:assetId",
  describeRoute(getAssetProcessingStatusRouteDescription),
  async (c) => {
    // ... (code is unchanged)
    const requestId = c.get("requestId");

    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const rawAssetType = c.req.param("assetType");
      const assetId = c.req.param("assetId");

      const validationResult = assetTypeSchema.safeParse(rawAssetType);
      if (!validationResult.success) {
        return c.json(
          { error: "Invalid asset type", validTypes: ASSET_TYPES },
          400,
        );
      }
      const assetType = validationResult.data;

      const job = await getProcessingJob(assetType, assetId, userId);

      if (!job) {
        return c.json({
          status: "unknown",
          stages: [],
          error: null,
          errorDetails: null,
          retryCount: 0,
          canRetry: false,
        });
      }

      // ... rest of the logic is unchanged
      return c.json({
        status: job.status,
        stages: job.stages,
        currentStage: job.currentStage,
        overallProgress: job.overallProgress,
        error: job.errorMessage || null,
        errorDetails: job.errorDetails || null,
        retryCount: job.retryCount,
        canRetry: job.canRetry,
        estimatedCompletion:
          job.status === "processing" ? estimateCompletion(job) : null,
      });
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error getting processing status",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

/**
 * POST /api/processing-status/retry
 * (No changes to this route)
 */
processingStatusRoutes.post(
  "/retry",
  describeRoute(postProcessingRetryRouteDescription),
  zValidator("json", RetryBodySchema),
  async (c) => {
    const requestId = c.get("requestId");
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { assetType, assetId } = c.req.valid("json");

      const result = await retryAssetProcessing(assetType, assetId, userId);
      if (result.success) {
        return c.json({ success: true, message: "Processing retry queued" });
      } else {
        return c.json({ error: result.error }, 400);
      }
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error retrying processing via JSON body",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

/**
 * POST /api/processing-status/:assetType/:assetId/retry
 * (No changes to this route)
 */
processingStatusRoutes.post(
  "/:assetType/:assetId/retry",
  describeRoute(postAssetProcessingRetryRouteDescription),
  zValidator("json", AssetRetryBodySchema),
  async (c) => {
    const requestId = c.get("requestId");
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const rawAssetType = c.req.param("assetType");
      const assetId = c.req.param("assetId");

      const { force } = c.req.valid("json");

      const validationResult = assetTypeSchema.safeParse(rawAssetType);
      if (!validationResult.success) {
        return c.json(
          { error: "Invalid asset type", validTypes: ASSET_TYPES },
          400,
        );
      }
      const assetType = validationResult.data;

      const result = await retryAssetProcessing(
        assetType,
        assetId,
        userId,
        force,
      );
      if (result.success) {
        return c.json({ success: true, message: "Processing retry queued" });
      } else {
        return c.json({ error: result.error }, 400);
      }
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Error retrying processing",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

// ================================================================= //
// =================== UPDATED UNIFIED ENDPOINT ==================== //
// ================================================================= //

/**
 * PUT /api/processing-status/:assetType/:assetId/update
 * The SINGLE, UNIFIED endpoint for all workers to report status and results.
 *
 * @tags Processing Status
 * @summary Update processing status and artifacts (internal worker endpoint)
 * @description Internal endpoint for workers to report status, progress, and results (artifacts).
 * @param {string} assetType - Type of asset (photos, documents, bookmarks, notes).
 * @param {string} assetId - ID of the asset.
 * @returns {object} Update result.
 */
processingStatusRoutes.put(
  "/:assetType/:assetId/update",
  describeRoute(putAssetProcessingStatusUpdateRouteDescription),
  zValidator("json", UpdateStatusBodySchema),
  async (c) => {
    const requestId = c.get("requestId");

    try {
      const rawAssetType = c.req.param("assetType");
      const assetId = c.req.param("assetId");

      // 1. Validate asset type
      const validationResult = assetTypeSchema.safeParse(rawAssetType);
      if (!validationResult.success) {
        logger.warn(
          { requestId, rawAssetType, assetId },
          "Invalid asset type in worker update",
        );
        return c.json(
          { error: "Invalid asset type", validTypes: ASSET_TYPES },
          400,
        );
      }
      const assetType = validationResult.data;

      // 2. Get validated body
      const {
        status,
        stage,
        progress,
        error,
        errorDetails,
        stages,
        addStages,
        artifacts,
        userId,
      } = c.req.valid("json");

      // 3. Validate userId for job initialization
      if (stages && Array.isArray(stages) && !userId) {
        return c.json({ error: "userId required for job initialization" }, 400);
      }

      logger.debug(
        {
          requestId,
          assetType,
          assetId,
          status,
          stage,
          hasArtifacts: !!artifacts,
        },
        "Worker update received",
      );

      // 4. Use the unified service function
      const job = await updateProcessingStatusWithArtifacts(
        assetType,
        assetId,
        userId ?? "",
        {
          status,
          stage,
          progress,
          error,
          errorDetails,
          stages,
          addStages,
          artifacts,
        },
      );

      if (!job) {
        logger.warn(
          { requestId, assetType, assetId },
          "Processing job not found for status update",
        );
        return c.json({ error: "Processing job not found" }, 404);
      }

      return c.json({ success: true, job });
    } catch (error: any) {
      logger.error(
        {
          requestId,
          assetType: c.req.param("assetType"),
          assetId: c.req.param("assetId"),
          error: error.message,
          stack: error.stack,
        },
        "Error updating processing status",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  },
);

/**
 * Basic heuristic to estimate completion time for processing jobs
 * (No changes to this helper function)
 */
function estimateCompletion(job: any): string | null {
  // ... (code is unchanged)
  if (!job.stages || job.stages.length === 0) return null;
  const completedStages = job.stages.filter(
    (s: any) => s.status === "completed",
  ).length;
  if (completedStages === 0) return null;
  const completedWithTime = job.stages.filter(
    (s: any) => s.status === "completed" && s.startedAt && s.completedAt,
  );
  if (completedWithTime.length === 0) return null;
  const avgTime =
    completedWithTime.reduce(
      (sum: number, s: any) => sum + (s.completedAt - s.startedAt),
      0,
    ) / completedWithTime.length;
  const remaining = job.stages.length - completedStages;
  const estimatedSeconds = remaining * avgTime;
  if (estimatedSeconds <= 0) return null;
  return new Date(Date.now() + estimatedSeconds * 1000).toISOString();
}
