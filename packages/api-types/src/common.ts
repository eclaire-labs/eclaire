/**
 * Shared schema primitives used across all entity response schemas.
 */

import {
  FLAG_COLORS,
  REVIEW_STATUSES,
  TASK_STATUSES,
} from "@eclaire/core/types";
import z from "zod/v4";

// Re-usable enum schemas derived from the core const arrays
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export const flagColorSchema = z.enum(FLAG_COLORS);
export const taskStatusSchema = z.enum(TASK_STATUSES);

// Inferred types
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type FlagColor = z.infer<typeof flagColorSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;

/**
 * Standard cursor-paginated list response envelope.
 * All GET list endpoints return this shape.
 */
export function paginatedResponseSchema(
  itemSchema: z.ZodType,
  ref: string,
  itemDescription: string,
) {
  return z
    .object({
      items: z
        .array(itemSchema)
        .meta({ description: `Array of ${itemDescription}` }),
      nextCursor: z.string().nullable().meta({
        description:
          "Opaque cursor for the next page, or null if no more pages",
      }),
      hasMore: z
        .boolean()
        .meta({ description: "Whether more items are available" }),
      totalCount: z.number().optional().meta({
        description:
          "Total number of items matching the query (only included on first page)",
      }),
    })
    .meta({ ref });
}
