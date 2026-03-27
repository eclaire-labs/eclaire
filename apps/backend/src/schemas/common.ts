/**
 * Common Schema Definitions
 *
 * Shared zod schemas and types used across multiple schema files.
 * Base schemas (reviewStatus, flagColor, taskStatus, paginatedResponse)
 * live in @eclaire/api-types and are re-exported here for backend convenience.
 */

import { REVIEW_STATUSES } from "@eclaire/core/types";
import { resolver } from "hono-openapi";
import z from "zod/v4";

// =============================================================================
// RE-EXPORT shared schemas from @eclaire/api-types
// =============================================================================

export {
  reviewStatusSchema,
  flagColorSchema,
  taskStatusSchema,
  paginatedResponseSchema,
  type ReviewStatus,
  type FlagColor,
  type TaskStatus,
} from "@eclaire/api-types/common";

import { flagColorSchema } from "@eclaire/api-types/common";

// =============================================================================
// BACKEND-ONLY: OpenAPI field schemas with metadata
// =============================================================================

/**
 * Review status schema with OpenAPI metadata.
 * Use this when defining API response/request schemas.
 */
export const reviewStatusFieldSchema = z.enum(REVIEW_STATUSES).meta({
  description: "Review status of the item",
  example: "pending",
});

/**
 * Task status schema with OpenAPI metadata.
 */
export const taskStatusFieldSchema = z
  .enum(["backlog", "open", "in-progress", "completed", "cancelled"])
  .meta({
    description: "Current status of the task",
    example: "open",
  });

// =============================================================================
// SHARED FIELD UPDATE SCHEMAS (for review/flag/pin endpoints)
// =============================================================================

export function reviewStatusUpdateSchema(resourceName: string, ref?: string) {
  const schema = z.object({
    reviewStatus: z.enum(REVIEW_STATUSES).meta({
      description: `New review status for the ${resourceName}`,
      examples: ["accepted", "rejected"],
    }),
  });
  return ref ? schema.meta({ ref }) : schema;
}

export function flagColorUpdateSchema(resourceName: string, ref?: string) {
  const schema = z.object({
    flagColor: flagColorSchema.nullable().meta({
      description: `Flag color for the ${resourceName} (null to remove flag)`,
      examples: ["red", "green", null],
    }),
  });
  return ref ? schema.meta({ ref }) : schema;
}

export function isPinnedUpdateSchema(resourceName: string, ref?: string) {
  const schema = z.object({
    isPinned: z.boolean().meta({
      description: `Whether to pin or unpin the ${resourceName}`,
      examples: [true, false],
    }),
  });
  return ref ? schema.meta({ ref }) : schema;
}

// =============================================================================
// PARTIAL SCHEMA HELPER
// =============================================================================

/**
 * Creates a partial version of a Zod object schema suitable for PATCH/PUT updates.
 * Unlike Zod's built-in .partial(), this helper:
 * - Preserves .meta() annotations (for OpenAPI generation)
 * - Strips .default() values (so absent fields stay undefined, not defaulted)
 * - Makes all fields optional while preserving nullable/validation semantics
 */
// biome-ignore lint/suspicious/noExplicitAny: generic Zod object type
export function makePartial<T extends z.ZodObject<any>>(
  objSchema: T,
): ReturnType<T["partial"]> {
  const newShape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(objSchema.shape)) {
    const meta = z.globalRegistry.get(field as z.ZodType);

    // Unwrap through optional/default/nullable wrappers to find the core type
    let core = field as z.ZodType;
    let isNullable = false;
    // biome-ignore lint/suspicious/noExplicitAny: accessing internal Zod structure
    while ((core as any)._zod?.def?.innerType) {
      // biome-ignore lint/suspicious/noExplicitAny: accessing internal Zod structure
      const def = (core as any)._zod.def;
      if (def.type === "nullable") isNullable = true;
      core = def.innerType;
    }

    // Rebuild: core -> nullable (if originally nullable) -> optional
    let newField: z.ZodType = core;
    if (isNullable) newField = (newField as z.ZodString).nullable();
    newField = newField.optional();
    if (meta) newField = newField.meta(meta);

    newShape[key] = newField;
  }
  // biome-ignore lint/suspicious/noExplicitAny: cast to match .partial() return type — runtime behavior is equivalent
  return z.object(newShape) as any;
}

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

// =============================================================================
// SHARED ERROR RESPONSES (for route descriptions)
// =============================================================================

import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./error-schemas.js";

const resolvedValidationError = resolver(ValidationErrorSchema);
const resolvedUnauthorized = resolver(UnauthorizedSchema);
const resolvedError = resolver(ErrorResponseSchema);

export const error401Response = {
  description: "Authentication required",
  content: { "application/json": { schema: resolvedUnauthorized } },
} as const;

export const error500Response = {
  description: "Internal server error",
  content: { "application/json": { schema: resolvedError } },
} as const;

export const error400Response = {
  description: "Invalid request data",
  content: { "application/json": { schema: resolvedValidationError } },
} as const;

/** 401 + 500 errors (for endpoints without request body validation) */
export const commonErrors = {
  401: error401Response,
  500: error500Response,
} as const;

/** 400 + 401 + 500 errors (for endpoints with request body validation) */
export const commonErrorsWithValidation = {
  400: error400Response,
  ...commonErrors,
} as const;

/** 404 error response for a specific resource type */
export function notFoundError(
  resourceName: string,
  schema: Parameters<typeof resolver>[0],
) {
  return {
    description: `${resourceName} not found`,
    content: { "application/json": { schema: resolver(schema) } },
  };
}
