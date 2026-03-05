/**
 * Error Response Schemas
 *
 * Extracted from all-responses.ts to break circular dependency with common.ts.
 */
import z from "zod/v4";

export const ValidationErrorSchema = z
  .object({
    error: z.string().meta({ description: "Error message" }),
    details: z
      .array(
        z.object({
          code: z.string(),
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      )
      .optional()
      .meta({ description: "Detailed validation errors" }),
  })
  .meta({ ref: "ValidationError" });

export const ErrorResponseSchema = z
  .object({
    error: z.string().meta({ description: "Error message" }),
    message: z
      .string()
      .optional()
      .meta({ description: "Additional error details" }),
  })
  .meta({ ref: "ErrorResponse" });

export const UnauthorizedSchema = z
  .object({
    error: z
      .literal("Unauthorized")
      .meta({ description: "Authentication required" }),
  })
  .meta({ ref: "Unauthorized" });
