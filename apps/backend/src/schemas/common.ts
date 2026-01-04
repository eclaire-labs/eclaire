/**
 * Common Schema Definitions
 *
 * Shared zod schemas and types used across multiple schema files.
 */

import z from "zod/v4";

// =============================================================================
// REVIEW STATUS
// =============================================================================

export const REVIEW_STATUSES = ["pending", "accepted", "rejected"] as const;
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

/**
 * Review status schema with OpenAPI metadata.
 * Use this when defining API response/request schemas.
 */
export const reviewStatusFieldSchema = reviewStatusSchema.meta({
  description: "Review status of the item",
  example: "pending",
});

// =============================================================================
// TASK STATUS
// =============================================================================

export const TASK_STATUSES = ["not-started", "in-progress", "completed"] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * Task status schema with OpenAPI metadata.
 */
export const taskStatusFieldSchema = taskStatusSchema.meta({
  description: "Current status of the task",
  example: "not-started",
});

// =============================================================================
// JSON VALUE (for dynamic/metadata fields)
// =============================================================================

/**
 * JSON-compatible value type for metadata and dynamic fields.
 * Safer alternative to z.any() - represents any valid JSON value.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Schema for JSON-compatible values.
 * Use this instead of z.any() for metadata, arguments, and dynamic data.
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

/**
 * Schema for tool call arguments - a record of JSON values.
 */
export const toolArgumentsSchema = z.record(z.string(), jsonValueSchema);
