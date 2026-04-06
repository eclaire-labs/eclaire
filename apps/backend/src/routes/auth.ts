import type { Context } from "hono";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth.js";
import { db, schema } from "../db/index.js";
import { createChildLogger } from "../lib/logger.js";
import { getInstanceSetting } from "../lib/services/instance-settings.js";
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
      // Resolve session lazily — only hits the DB for sign-out events
      const resolveSession = c.get("resolveSession");
      const resolved = resolveSession ? await resolveSession() : null;

      if (resolved) {
        await recordLogoutHistory({
          userId: resolved.user.id,
          sessionId: resolved.session.id,
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
  const path = requestURL.pathname;
  const method = c.req.method;

  try {
    // Block registration when disabled
    if (path.includes("/sign-up/email") && method === "POST") {
      const enabled = await getInstanceSetting("instance.registrationEnabled");
      if (enabled === false) {
        return c.json(
          {
            code: "REGISTRATION_DISABLED",
            message: "Registration is currently disabled",
          },
          403,
        );
      }
    }

    // Block suspended users at sign-in
    if (path.includes("/sign-in/email") && method === "POST") {
      const cloned = c.req.raw.clone();
      try {
        const body = (await cloned.json()) as { email?: string };
        if (body.email) {
          const user = await db.query.users.findFirst({
            where: eq(schema.users.email, body.email),
            columns: { accountStatus: true },
          });
          if (user?.accountStatus === "suspended") {
            return c.json(
              {
                code: "ACCOUNT_SUSPENDED",
                message:
                  "Your account has been suspended. Contact an administrator.",
              },
              403,
            );
          }
        }
      } catch {
        // If we can't parse the body, let Better Auth handle the error
      }
    }

    const result = await auth.handler(c.req.raw);

    if (result && result.status === 200) {
      await recordAuthenticationEvent(c, path, result);
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

    return c.json({ error: "Authentication failed" }, 500);
  }
});
