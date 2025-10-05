process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Application specific logging, throwing an error, or other logic here
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception thrown:", error);
  // Application specific logging, throwing an error, or other logic here
  process.exit(1);
});

// CRITICAL: Load environment variables FIRST, before any other imports
import "./lib/env-loader";
import { validateRequiredEnvVars } from "./lib/env-validation";

// Validate required environment variables before starting
validateRequiredEnvVars();

// Now import modules that depend on environment variables
import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { showRoutes } from "hono/dev";
import { validateAIConfigOnStartup } from "./lib/ai-client";
import { auth } from "./lib/auth";
import { validateEncryptionService } from "./lib/encryption";
import { logger, smartLogger } from "./lib/logger";
import { closeQueues } from "./lib/queues";
import {
  recordLoginHistory,
  recordLogoutHistory,
} from "./lib/services/history";
import {
  startAllTelegramBots,
  stopAllTelegramBots,
} from "./lib/services/telegram";

import { allRoutes } from "./routes/all";
import { bookmarksRoutes } from "./routes/bookmarks";
import { channelsRoutes } from "./routes/channels";
import { conversationsRoutes } from "./routes/conversations";
import { documentsRoutes } from "./routes/documents";
import { feedbackRoutes } from "./routes/feedback";
import { historyRoutes } from "./routes/history";
import { modelRoutes } from "./routes/model";
import { notesRoutes } from "./routes/notes";
import { notificationsRoutes } from "./routes/notifications";
import { photosRoutes } from "./routes/photos";
import { processingEventsRoutes } from "./routes/processing-events";
import { processingStatusRoutes } from "./routes/processing-status";
import { promptRoutes } from "./routes/prompt";
import { tasksRoutes } from "./routes/tasks";
import { userRoutes } from "./routes/user";

// Define the context type for Better Auth session and user
type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  requestId: string;
};

const app = new Hono<{ Variables: Variables }>();

// Smart Pino logger middleware - logs all HTTP requests with protection against large content
app.use("*", smartLogger());

// Define allowed origins
const getAllowedOrigins = () => {
  return process.env.NODE_ENV === "production"
    ? [
        process.env.FRONTEND_URL || "http://localhost:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://frontend:3000",
      ]
    : [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://frontend:3000",
      ];
};

// CORS configuration with explicit allowed origins
app.use(
  "*",
  cors({
    origin: getAllowedOrigins(),
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Add manual CORS logging for debugging
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    const origin = c.req.header("origin");
    const allowedOrigins = getAllowedOrigins();

    logger.info(
      {
        method: "OPTIONS",
        origin,
        allowedOrigins,
        path: c.req.path,
        headers: {
          "access-control-request-method": c.req.header(
            "access-control-request-method",
          ),
          "access-control-request-headers": c.req.header(
            "access-control-request-headers",
          ),
        },
      },
      "🔍 CORS preflight request",
    );
  }

  await next();

  // Log response headers for OPTIONS
  if (c.req.method === "OPTIONS") {
    logger.info(
      {
        responseHeaders: {
          "access-control-allow-origin": c.res.headers.get(
            "access-control-allow-origin",
          ),
          "access-control-allow-credentials": c.res.headers.get(
            "access-control-allow-credentials",
          ),
          "access-control-allow-methods": c.res.headers.get(
            "access-control-allow-methods",
          ),
          "access-control-allow-headers": c.res.headers.get(
            "access-control-allow-headers",
          ),
        },
      },
      "📤 CORS preflight response",
    );
  }
});

// Session middleware - this runs on every request to inject user/session into context
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    c.set("user", null);
    c.set("session", null);
    return next();
  }

  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});

// Helper function to record authentication events
async function recordAuthenticationEvent(
  c: Context,
  path: string,
  result: Response,
) {
  try {
    const ipAddress =
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const userAgent = c.req.header("user-agent") || "unknown";

    // Get response data to extract user and session info
    const responseClone = result.clone();
    const responseData = (await responseClone.json()) as any;

    // Extract authentication metadata
    const metadata = {
      ipAddress,
      userAgent,
      authMethod: "email_password", // Default for Better Auth email/password
    };

    // Handle different authentication endpoints
    if (path.includes("/sign-in/email") && responseData.user) {
      // Login successful
      await recordLoginHistory({
        userId: responseData.user.id,
        sessionId: responseData.token || "session", // Use token as session identifier
        metadata,
        success: true,
      });
    } else if (path.includes("/sign-out")) {
      // Logout - try to get user from context since response might not have user info
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
      // New user registration - record as login since they're auto-signed in
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
    // Log error but don't fail the auth request
    logger.error(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        path,
      },
      "Failed to record authentication event",
    );
  }
}

// Better Auth handler - handles all auth routes
app.all("/api/auth/*", async (c) => {
  const requestURL = new URL(c.req.url);
  const requestId = c.get("requestId");

  // Add this logging
  logger.info(
    {
      requestId,
      path: requestURL.pathname,
      method: c.req.method,
      url: c.req.url,
      origin: c.req.header("origin"),
      referer: c.req.header("referer"),
    },
    "🔍 Auth request received",
  );

  logger.debug(
    {
      requestId,
      path: requestURL.pathname,
      method: c.req.method,
      url: c.req.url,
    },
    "Auth handler processing request",
  );

  try {
    const result = await auth.handler(c.req.raw);

    // Record authentication events after successful processing
    if (result && result.status === 200) {
      await recordAuthenticationEvent(c, requestURL.pathname, result);
    }

    logger.info(
      {
        requestId,
        status: result ? result.status : "no result",
      },
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

// Health check endpoint with version info
app.get("/health", (c) => {
  const buildInfo = {
    version: process.env.APP_VERSION || "N/A",
    fullVersion: process.env.APP_FULL_VERSION || "N/A",
    buildNumber: process.env.APP_BUILD_NUMBER || "N/A",
    gitHash: process.env.APP_GIT_HASH || "N/A",
    buildTimestamp: process.env.APP_BUILD_TIMESTAMP || "N/A",
  };

  return c.json({
    status: "ok",
    service: "eclaire-backend",
    version: buildInfo.version,
    fullVersion: buildInfo.fullVersion,
    buildNumber: buildInfo.buildNumber,
    gitHash: buildInfo.gitHash,
    buildTimestamp: buildInfo.buildTimestamp,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Session test endpoint
app.get("/api/session", (c) => {
  const session = c.get("session");
  const user = c.get("user");

  if (!user) {
    return c.json({ session: null, user: null }, 200);
  }

  return c.json({
    session,
    user,
  });
});

// Register API routes
app.route("/api/tasks", tasksRoutes);
app.route("/api/bookmarks", bookmarksRoutes);
app.route("/api/channels", channelsRoutes);
app.route("/api/conversations", conversationsRoutes);
app.route("/api/documents", documentsRoutes);
app.route("/api/feedback", feedbackRoutes);
app.route("/api/notes", notesRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/photos", photosRoutes);
app.route("/api/history", historyRoutes);
app.route("/api/all", allRoutes);
app.route("/api/user", userRoutes);
app.route("/api/model", modelRoutes);
app.route("/api/prompt", promptRoutes);
app.route("/api/processing-status", processingStatusRoutes);
app.route("/api/processing-events", processingEventsRoutes);

// Start the server
const start = async () => {
  try {
    // Validate configurations first - fail fast if not properly configured
    validateAIConfigOnStartup();

    // Validate encryption service if MASTER_ENCRYPTION_KEY is provided
    if (process.env.MASTER_ENCRYPTION_KEY) {
      validateEncryptionService();
      logger.info("Encryption service validated successfully");
    } else {
      logger.warn(
        "MASTER_ENCRYPTION_KEY not set - channel encryption disabled",
      );
    }

    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || "0.0.0.0";

    logger.info(
      {
        port,
        host,
        endpoints: {
          auth: `http://${host}:${port}/api/auth`,
          session: `http://${host}:${port}/api/session`,
          channels: `http://${host}:${port}/api/channels`,
          notifications: `http://${host}:${port}/api/notifications`,
        },
      },
      "Backend server starting",
    );

    logger.info({}, "Registered Hono routes:");
    showRoutes(app);
    logger.info({}, "Route registration complete");

    serve({
      fetch: app.fetch,
      port,
      hostname: host,
    });

    logger.info({ port, host }, "Server running successfully");

    // Start Telegram bots after server is running
    if (process.env.MASTER_ENCRYPTION_KEY) {
      logger.info("Starting Telegram bots...");
      await startAllTelegramBots();
    } else {
      logger.info("Skipping Telegram bot startup - encryption not configured");
    }
  } catch (err) {
    logger.error({ error: err }, "Failed to start server");
    process.exit(1);
  }
};

start();

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info(
    { signal },
    "Shutdown signal received. Shutting down gracefully...",
  );

  try {
    // Stop Telegram bots first
    await stopAllTelegramBots();
    logger.info("Telegram bots stopped");
  } catch (error) {
    logger.error({ error }, "Error stopping Telegram bots");
  }

  try {
    await closeQueues();
    logger.info("Queue connections closed");
  } catch (error) {
    logger.error({ error }, "Error closing queue connections");
  }

  logger.info("Shutdown complete");
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
