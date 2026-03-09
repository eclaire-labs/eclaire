import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { createChildLogger } from "../lib/logger.js";
import {
  getProcessingJob,
  getUserProcessingJobs,
  getUserProcessingSummary,
  retryAssetProcessing,
} from "../lib/services/processing-status.js";
import { withAuth } from "../middleware/with-auth.js";
import { ASSET_TYPES, assetTypeSchema } from "../schemas/asset-types.js";
import {
  AssetRetryBodySchema,
  RetryBodySchema,
} from "../schemas/processing-status-params.js";
import {
  getAssetProcessingStatusRouteDescription,
  getProcessingJobsRouteDescription,
  getProcessingStatusSummaryRouteDescription,
  postAssetProcessingRetryRouteDescription,
  postProcessingRetryRouteDescription,
} from "../schemas/processing-status-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("processing-status-routes");

export const processingStatusRoutes = new Hono<{ Variables: RouteVariables }>();

/**
 * GET /api/processing-status/summary
 */
processingStatusRoutes.get(
  "/summary",
  describeRoute(getProcessingStatusSummaryRouteDescription),
  withAuth(async (c, userId) => {
    const summary = await getUserProcessingSummary(userId);
    return c.json(summary);
  }, logger),
);

/**
 * GET /api/processing-status/jobs
 */
processingStatusRoutes.get(
  "/jobs",
  describeRoute(getProcessingJobsRouteDescription),
  withAuth(async (c, userId) => {
    const requestId = c.get("requestId");

    logger.info(
      { requestId, path: "/jobs", method: "GET" },
      "Processing jobs route called",
    );

    const status = c.req.query("status");
    const assetType = c.req.query("assetType");
    const search = c.req.query("search");
    const limit = parseInt(c.req.query("limit") || "100", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    const jobs = await getUserProcessingJobs(userId, {
      // biome-ignore lint/suspicious/noExplicitAny: query param string to enum type
      status: status as any,
      // biome-ignore lint/suspicious/noExplicitAny: query param string to enum type
      assetType: assetType as any,
      search,
      limit,
      offset,
    });

    return c.json(jobs);
  }, logger),
);

/**
 * GET /api/processing-status/:assetType/:assetId
 */
processingStatusRoutes.get(
  "/:assetType/:assetId",
  describeRoute(getAssetProcessingStatusRouteDescription),
  withAuth(async (c, userId) => {
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
  }, logger),
);

/**
 * POST /api/processing-status/retry
 */
processingStatusRoutes.post(
  "/retry",
  describeRoute(postProcessingRetryRouteDescription),
  zValidator("json", RetryBodySchema),
  withAuth(async (c, userId) => {
    const { assetType, assetId } = c.req.valid("json");

    const result = await retryAssetProcessing(assetType, assetId, userId);
    if (result.success) {
      return c.json({ success: true, message: "Processing retry queued" });
    } else {
      return c.json({ error: result.error }, 400);
    }
  }, logger),
);

/**
 * POST /api/processing-status/:assetType/:assetId/retry
 */
processingStatusRoutes.post(
  "/:assetType/:assetId/retry",
  describeRoute(postAssetProcessingRetryRouteDescription),
  zValidator("json", AssetRetryBodySchema),
  withAuth(async (c, userId) => {
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
  }, logger),
);

/**
 * Basic heuristic to estimate completion time for processing jobs
 * (No changes to this helper function)
 */
// biome-ignore lint/suspicious/noExplicitAny: raw formatted job with dynamic stages
function estimateCompletion(job: any): string | null {
  // ... (code is unchanged)
  if (!job.stages || job.stages.length === 0) return null;
  const completedStages = job.stages.filter(
    // biome-ignore lint/suspicious/noExplicitAny: raw formatted job with dynamic stages
    (s: any) => s.status === "completed",
  ).length;
  if (completedStages === 0) return null;
  const completedWithTime = job.stages.filter(
    // biome-ignore lint/suspicious/noExplicitAny: raw formatted job with dynamic stages
    (s: any) => s.status === "completed" && s.startedAt && s.completedAt,
  );
  if (completedWithTime.length === 0) return null;
  const avgTime =
    completedWithTime.reduce(
      // biome-ignore lint/suspicious/noExplicitAny: raw formatted job with dynamic stages
      (sum: number, s: any) => sum + (s.completedAt - s.startedAt),
      0,
    ) / completedWithTime.length;
  const remaining = job.stages.length - completedStages;
  const estimatedSeconds = remaining * avgTime;
  if (estimatedSeconds <= 0) return null;
  return new Date(Date.now() + estimatedSeconds * 1000).toISOString();
}
