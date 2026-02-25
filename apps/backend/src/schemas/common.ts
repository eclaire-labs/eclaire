/**
 * Common Schema Definitions
 *
 * Shared zod schemas and types used across multiple schema files.
 */

import { resolver } from "hono-openapi";
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
// FLAG COLORS
// =============================================================================

export const FLAG_COLORS = [
  "red",
  "yellow",
  "orange",
  "green",
  "blue",
] as const;
export const flagColorSchema = z.enum(FLAG_COLORS);
export type FlagColor = z.infer<typeof flagColorSchema>;

// =============================================================================
// SHARED FIELD UPDATE SCHEMAS (for review/flag/pin endpoints)
// =============================================================================

export function reviewStatusUpdateSchema(resourceName: string) {
  return z.object({
    reviewStatus: z.enum(REVIEW_STATUSES).meta({
      description: `New review status for the ${resourceName}`,
      examples: ["accepted", "rejected"],
    }),
  });
}

export function flagColorUpdateSchema(resourceName: string) {
  return z.object({
    flagColor: flagColorSchema.nullable().meta({
      description: `Flag color for the ${resourceName} (null to remove flag)`,
      examples: ["red", "green", null],
    }),
  });
}

export function isPinnedUpdateSchema(resourceName: string) {
  return z.object({
    isPinned: z.boolean().meta({
      description: `Whether to pin or unpin the ${resourceName}`,
      examples: [true, false],
    }),
  });
}

// =============================================================================
// TASK STATUS
// =============================================================================

export const TASK_STATUSES = [
  "not-started",
  "in-progress",
  "completed",
] as const;
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
  ]),
);

/**
 * Schema for tool call arguments - a record of JSON values.
 */
export const toolArgumentsSchema = z.record(z.string(), jsonValueSchema);

// =============================================================================
// REQUEST BODY RESOLVER
// =============================================================================

/**
 * Wrapper around hono-openapi resolver() for use in requestBody schemas.
 * DescribeRouteOptions.requestBody inherits from OpenAPIV3_1.OperationObject
 * which expects SchemaObject, not ResolverReturnType.
 */
export function requestBodyResolver(
  schema: Parameters<typeof resolver>[0],
  // biome-ignore lint/suspicious/noExplicitAny: resolver() returns ResolverReturnType but requestBody.schema expects SchemaObject
): any {
  return resolver(schema);
}
