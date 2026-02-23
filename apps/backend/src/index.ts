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
import "./lib/env-loader.js";
// Config system initializes immediately on import, auto-generating secrets if needed
import { config, initConfig } from "./config/index.js";

// Validate configuration (logs warnings in dev, fails fast in production)
initConfig();

const SERVICE_ROLE = config.serviceRole;
const QUEUE_BACKEND = config.queueBackend;

import { validateAIConfigOnStartup } from "@eclaire/ai";
// Now import modules that depend on environment variables
import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { showRoutes } from "hono/dev";
import { initializeAI } from "./lib/ai-init.js";
import { auth } from "./lib/auth.js";
import { validateEncryptionService } from "./lib/encryption.js";
import { logger, smartLogger } from "./lib/logger.js";
import {
  closeQueues,
  startScheduler,
  stopScheduler,
} from "./lib/queue/index.js";
import {
  recordLoginHistory,
  recordLogoutHistory,
} from "./lib/services/history.js";
import {
  startAllTelegramBots,
  stopAllTelegramBots,
} from "./lib/services/telegram.js";

import { allRoutes } from "./routes/all.js";
import { bookmarksRoutes } from "./routes/bookmarks.js";
import { channelsRoutes } from "./routes/channels.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { documentsRoutes } from "./routes/documents.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { historyRoutes } from "./routes/history.js";
import { modelRoutes } from "./routes/model.js";
import { notesRoutes } from "./routes/notes.js";
import { notificationsRoutes } from "./routes/notifications.js";
import { photosRoutes } from "./routes/photos.js";
import { processingEventsRoutes } from "./routes/processing-events.js";
import { processingStatusRoutes } from "./routes/processing-status.js";
import { promptRoutes } from "./routes/prompt.js";
import { tasksRoutes } from "./routes/tasks.js";
import { userRoutes } from "./routes/user.js";

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
  return config.isProduction
    ? [
        config.services.frontendUrl,
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
    const responseData = (await responseClone.json()) as {
      user?: { id: string };
      token?: string;
    };

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

// Health check handler
const healthHandler = (c: Context<{ Variables: Variables }>) => {
  // Build info comes from environment set during Docker build
  const buildInfo = {
    version: process.env.APP_VERSION || "N/A",
    fullVersion: process.env.APP_FULL_VERSION || "N/A",
    gitHash: process.env.APP_GIT_HASH || "N/A",
    buildTimestamp: process.env.APP_BUILD_TIMESTAMP || "N/A",
  };

  return c.json({
    status: "ok",
    service: "eclaire",
    version: buildInfo.version,
    fullVersion: buildInfo.fullVersion,
    gitHash: buildInfo.gitHash,
    buildTimestamp: buildInfo.buildTimestamp,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  });
};

// Health check endpoints - /health for load balancers, /api/health for frontend
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

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

// SPA middleware - serves frontend static files and falls back to index.html
// Must be registered AFTER all API routes
import { createSpaMiddleware } from "./middleware/static-spa.js";

app.use("*", createSpaMiddleware());

// Start the server
const start = async () => {
  try {
    logger.info({ SERVICE_ROLE, QUEUE_BACKEND }, "Starting service");

    // Only start HTTP server if role includes API functionality
    if (SERVICE_ROLE === "api" || SERVICE_ROLE === "all") {
      // Initialize AI client before validation
      initializeAI();

      // Validate configurations first - fail fast if not properly configured
      validateAIConfigOnStartup();

      // Validate encryption service if MASTER_ENCRYPTION_KEY is provided
      if (config.security.masterEncryptionKey) {
        validateEncryptionService();
        logger.info("Encryption service validated successfully");
      } else {
        logger.warn(
          "MASTER_ENCRYPTION_KEY not set - channel encryption disabled",
        );
      }

      const port = config.port;
      const host = config.host;

      logger.info(
        {
          port,
          host,
          serviceRole: SERVICE_ROLE,
          queueBackend: QUEUE_BACKEND,
          endpoints: {
            auth: `http://${host}:${port}/api/auth`,
            session: `http://${host}:${port}/api/session`,
            channels: `http://${host}:${port}/api/channels`,
            notifications: `http://${host}:${port}/api/notifications`,
          },
        },
        "Backend HTTP server starting",
      );

      logger.info({}, "Registered Hono routes:");
      showRoutes(app);
      logger.info({}, "Route registration complete");

      serve({
        fetch: app.fetch,
        port,
        hostname: host,
      });

      logger.info(
        { port, host, SERVICE_ROLE, QUEUE_BACKEND },
        "HTTP server running successfully",
      );

      // Start Telegram bots after server is running
      if (config.security.masterEncryptionKey) {
        logger.info("Starting Telegram bots...");
        await startAllTelegramBots();
      } else {
        logger.info(
          "Skipping Telegram bot startup - encryption not configured",
        );
      }

      // In 'all' mode, start the scheduler for recurring tasks
      if (SERVICE_ROLE === "all") {
        logger.info("Starting scheduler for recurring tasks");
        await startScheduler();
      }
    }

    // Start workers based on SERVICE_ROLE and QUEUE_BACKEND
    if (SERVICE_ROLE === "all" || SERVICE_ROLE === "worker") {
      if (QUEUE_BACKEND === "redis") {
        logger.info("Starting BullMQ workers (redis backend)");
        const { startBullMQWorkers } = await import("./workers/index.js");
        await startBullMQWorkers();
      } else {
        // postgres or sqlite backend
        logger.info(
          { queueBackend: QUEUE_BACKEND },
          "Starting database queue workers",
        );
        const { startDatabaseWorkers } = await import("./workers/index.js");
        await startDatabaseWorkers();
      }
    }

    logger.info({ SERVICE_ROLE, QUEUE_BACKEND }, "Service startup complete");
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        errorType: err?.constructor?.name,
        SERVICE_ROLE,
        QUEUE_BACKEND,
      },
      "Failed to start service",
    );
    // Also log to console for visibility in case logger fails
    console.error("Failed to start service:", err);
    process.exit(1);
  }
};

start();

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info(
    { signal, SERVICE_ROLE, QUEUE_BACKEND },
    "Shutdown signal received. Shutting down gracefully...",
  );

  try {
    // Stop Telegram bots first
    await stopAllTelegramBots();
    logger.info("Telegram bots stopped");
  } catch (error) {
    logger.error({ error }, "Error stopping Telegram bots");
  }

  // Stop scheduler if running (all mode)
  if (SERVICE_ROLE === "all") {
    try {
      await stopScheduler();
      logger.info("Scheduler stopped");
    } catch (error) {
      logger.error({ error }, "Error stopping scheduler");
    }
  }

  // Stop workers if running (worker or all mode)
  if (SERVICE_ROLE === "worker" || SERVICE_ROLE === "all") {
    try {
      const { shutdownWorkers } = await import("./workers/index.js");
      await shutdownWorkers();
      logger.info("Workers stopped");
    } catch (error) {
      logger.error({ error }, "Error stopping workers");
    }
  }

  try {
    // Close processing events
    const { closeProcessingEvents } = await import(
      "./routes/processing-events.js"
    );
    await closeProcessingEvents();
    logger.info("Processing events closed");
  } catch (error) {
    logger.error({ error }, "Error closing processing events");
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
