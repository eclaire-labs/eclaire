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
  startAllTelegramBots,
  stopAllTelegramBots,
} from "./lib/services/telegram.js";

import { allRoutes } from "./routes/all.js";
import { authRoutes } from "./routes/auth.js";
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

// Auth routes (Better Auth handler + event recording)
app.route("/api/auth", authRoutes);

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
