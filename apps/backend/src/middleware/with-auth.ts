import type { Context } from "hono";
import type { Logger } from "pino";
import z from "zod/v4";
import type { ApiKeyScope } from "@eclaire/api-types";
import {
  assertPrincipalScopes,
  inferRequiredScopesForRequest,
  type AuthPrincipal,
} from "../lib/auth-principal.js";
import { getAuthenticatedPrincipal } from "../lib/auth-utils.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../lib/errors.js";
import type { RouteVariables } from "../types/route-variables.js";

type HonoContext = Context<{ Variables: RouteVariables }>;

type AuthHandler = (
  // biome-ignore lint/suspicious/noExplicitAny: validator middleware enriches the context at call sites; keeping the handler context open preserves those validated types
  c: any,
  userId: string,
  principal: AuthPrincipal,
  // biome-ignore lint/suspicious/noExplicitAny: Hono handlers return typed responses that don't share a clean common generic here
) => Promise<any> | any;

interface WithAuthOptions {
  allowApiKey?: boolean;
  requiredScopes?: ApiKeyScope[];
}

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
export function withAuth(
  handler: AuthHandler,
  logger: Logger,
  options?: WithAuthOptions,
) {
  return async (c: HonoContext) => {
    const principal = await getAuthenticatedPrincipal(c);
    if (!principal) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      if (
        principal.authMethod === "api_key" &&
        options?.allowApiKey === false
      ) {
        return c.json(
          { error: "API keys are not allowed for this endpoint" },
          403,
        );
      }

      const requiredScopes =
        options?.requiredScopes ??
        inferRequiredScopesForRequest(c.req.path, c.req.method);

      assertPrincipalScopes(principal, requiredScopes);

      c.set("principal", principal);
      return await handler(c, principal.ownerUserId, principal);
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
          userId: principal.ownerUserId,
          actorId: principal.actorId,
          grantId: principal.grantId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Unhandled error in route handler",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  };
}
