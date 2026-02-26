import type { Context } from "hono";
import { Hono } from "hono";
import { auth } from "../lib/auth.js";
import { createChildLogger } from "../lib/logger.js";
import {
  recordLoginHistory,
  recordLogoutHistory,
} from "../lib/services/history.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("auth");

export const authRoutes = new Hono<{ Variables: RouteVariables }>();

async function recordAuthenticationEvent(
  c: Context,
  path: string,
  result: Response,
) {
  try {
    const ipAddress =
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const userAgent = c.req.header("user-agent") || "unknown";

    const responseClone = result.clone();
    const responseData = (await responseClone.json()) as {
      user?: { id: string };
      token?: string;
    };

    const metadata = {
      ipAddress,
      userAgent,
      authMethod: "email_password",
    };

    if (path.includes("/sign-in/email") && responseData.user) {
      await recordLoginHistory({
        userId: responseData.user.id,
        sessionId: responseData.token || "session",
        metadata,
        success: true,
      });
    } else if (path.includes("/sign-out")) {
      const user = c.get("user");
      const session = c.get("session");

      if (user && session) {
        await recordLogoutHistory({
          userId: user.id,
          sessionId: session.id,
          metadata,
        });
      }
    } else if (path.includes("/sign-up/email") && responseData.user) {
      await recordLoginHistory({
        userId: responseData.user.id,
        sessionId: responseData.token || "session",
        metadata: {
          ...metadata,
          authMethod: "registration",
        },
        success: true,
      });
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        path,
      },
      "Failed to record authentication event",
    );
  }
}

authRoutes.all("/*", async (c) => {
  const requestURL = new URL(c.req.url);
  const requestId = c.get("requestId");

  try {
    const result = await auth.handler(c.req.raw);

    if (result && result.status === 200) {
      await recordAuthenticationEvent(c, requestURL.pathname, result);
    }

    logger.debug(
      { requestId, status: result ? result.status : "no result" },
      "Auth handler completed",
    );
    return result;
  } catch (error) {
    logger.error(
      {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Auth handler failed",
    );

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return c.json(
      { error: "Authentication failed", details: errorMessage },
      500,
    );
  }
});
