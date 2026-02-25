import type { Context } from "hono";
import type { Logger } from "pino";
import z from "zod/v4";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import type { RouteVariables } from "../types/route-variables.js";

type HonoContext = Context<{ Variables: RouteVariables }>;

// biome-ignore lint/suspicious/noExplicitAny: Hono's validator middleware enriches the context type — using `any` for the context parameter lets validated data (c.req.valid) flow through without type errors
type AuthHandler = (c: any, userId: string) => Promise<any> | any;

/**
 * Route handler wrapper that provides authenticated userId and centralized error handling.
 *
 * - Checks authentication (session or API key) and returns 401 if not authenticated
 * - Maps known error types to appropriate HTTP status codes:
 *   - NotFoundError → 404
 *   - ForbiddenError → 403
 *   - ValidationError → 400
 *   - ZodError → 400 with details
 * - Catches unexpected errors, logs them, and returns 500
 */
export function withAuth(handler: AuthHandler, logger: Logger) {
  return async (c: HonoContext) => {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      return await handler(c, userId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.json({ error: error.message }, 404);
      }
      if (error instanceof ForbiddenError) {
        return c.json({ error: error.message }, 403);
      }
      if (error instanceof ValidationError) {
        return c.json({ error: error.message }, 400);
      }
      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.issues },
          400,
        );
      }

      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Unhandled error in route handler",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  };
}
