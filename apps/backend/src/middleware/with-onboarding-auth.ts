/**
 * Adaptive auth middleware for onboarding routes.
 *
 * - No users exist → public access (first visitor needs to see the welcome screen)
 * - Users exist → requires auth + isInstanceAdmin
 */

import { count } from "drizzle-orm";
import type { Context } from "hono";
import type { Logger } from "pino";
import { db, schema } from "../db/index.js";
import {
  assertInstanceAdmin,
  getAuthenticatedPrincipal,
} from "../lib/auth-utils.js";
import type { RouteVariables } from "../types/route-variables.js";

type HonoContext = Context<{ Variables: RouteVariables }>;

type OnboardingHandler = (
  c: HonoContext,
  userId: string | null,
) => Promise<Response> | Response;

/**
 * Wraps a route handler with adaptive onboarding auth.
 *
 * When no users exist the handler is called with userId=null (public access).
 * When users exist the handler requires a valid session from an instance admin.
 */
export function withOnboardingAuth(handler: OnboardingHandler, logger: Logger) {
  return async (c: HonoContext) => {
    try {
      const result = await db.select({ count: count() }).from(schema.users);
      const userCount = result[0]?.count ?? 0;

      if (userCount === 0) {
        // No users — public access for initial setup
        return await handler(c, null);
      }

      // Users exist — require authenticated admin
      const principal = await getAuthenticatedPrincipal(c);
      if (!principal) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      await assertInstanceAdmin(principal.ownerUserId);
      return await handler(c, principal.ownerUserId);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("admin access required")
      ) {
        return c.json({ error: "Instance admin access required" }, 403);
      }
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Onboarding auth error",
      );
      return c.json({ error: "Internal server error" }, 500);
    }
  };
}
