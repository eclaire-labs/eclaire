import z from "zod/v4";
import { assetTypeSchema } from "./asset-types.js";

// POST /api/processing-status/retry
export const RetryBodySchema = z.object({
  assetType: assetTypeSchema,
  assetId: z.string().min(1),
});

// POST /api/processing-status/:assetType/:assetId/retry
export const AssetRetryBodySchema = z.object({
  force: z.boolean().optional(),
});

// PUT /api/processing-status/:assetType/:assetId/update
export const UpdateStatusBodySchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  stage: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  error: z.string().optional(),
  errorDetails: z.record(z.string(), z.unknown()).optional(),
  stages: z.array(z.string()).optional(),
  addStages: z.array(z.string()).optional(),
  artifacts: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().optional(),
});

export type RetryBody = z.infer<typeof RetryBodySchema>;
export type AssetRetryBody = z.infer<typeof AssetRetryBodySchema>;
export type UpdateStatusBody = z.infer<typeof UpdateStatusBodySchema>;
