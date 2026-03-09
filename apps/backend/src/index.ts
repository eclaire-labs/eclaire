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
import "@eclaire/core";
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
import { createSpaMiddleware } from "./middleware/static-spa.js";
import {
  closeQueues,
  startScheduler,
  stopScheduler,
} from "./lib/queue/index.js";
import { channelRegistry } from "./lib/channels.js";

import { allRoutes } from "./routes/all.js";
import { authRoutes } from "./routes/auth.js";
import { bookmarksRoutes } from "./routes/bookmarks.js";
import { channelsRoutes } from "./routes/channels.js";
import { documentsRoutes } from "./routes/documents.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { historyRoutes } from "./routes/history.js";
import { modelRoutes } from "./routes/model.js";
import { notesRoutes } from "./routes/notes.js";
import { notificationsRoutes } from "./routes/notifications.js";
import { photosRoutes } from "./routes/photos.js";
import { processingEventsRoutes } from "./routes/processing-events.js";
import { processingStatusRoutes } from "./routes/processing-status.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { tagsRoutes } from "./routes/tags.js";
import { tasksRoutes } from "./routes/tasks.js";
import { userRoutes } from "./routes/user.js";

import type { RouteVariables } from "./types/route-variables.js";

type Variables = RouteVariables;

const app = new Hono<{ Variables: Variables }>();

// Smart Pino logger middleware - logs all HTTP requests with protection against large content
app.use("*", smartLogger());

// Define allowed origins
const getAllowedOrigins = () => {
  const origins = [config.services.frontendUrl, "http://frontend:3000"];
  if (!config.isProduction) {
    origins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }
  return origins;
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

// Session middleware - provides a lazy session resolver
// The session is only resolved (DB hit) when a route handler actually needs it
app.use("*", async (c, next) => {
  c.set("user", null);
  c.set("session", null);

  // Lazy resolver: caches the result so the DB is hit at most once per request
  let cached:
    | {
        user: typeof auth.$Infer.Session.user;
        session: typeof auth.$Infer.Session.session;
      }
    | null
    | undefined;
  c.set("resolveSession", async () => {
    if (cached !== undefined) return cached;
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    cached = result ?? null;
    if (cached) {
      c.set("user", cached.user);
      c.set("session", cached.session);
    }
    return cached;
  });

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

// Health check endpoint for load balancers / Docker / k8s
app.get("/health", healthHandler);

// Register API routes
app.route("/api/tasks", tasksRoutes);
app.route("/api/bookmarks", bookmarksRoutes);
app.route("/api/channels", channelsRoutes);
app.route("/api/documents", documentsRoutes);
app.route("/api/feedback", feedbackRoutes);
app.route("/api/notes", notesRoutes);
app.route("/api/notifications", notificationsRoutes);
app.route("/api/photos", photosRoutes);
app.route("/api/history", historyRoutes);
app.route("/api/all", allRoutes);
app.route("/api/user", userRoutes);
app.route("/api/model", modelRoutes);
app.route("/api/sessions", sessionsRoutes);
app.route("/api/processing-status", processingStatusRoutes);
app.route("/api/processing-events", processingEventsRoutes);
app.route("/api/tags", tagsRoutes);

// SPA middleware - serves frontend static files and falls back to index.html
// Must be registered AFTER all API routes
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
        logger.info("Starting channel adapters...");
        await channelRegistry.startAll();
      } else {
        logger.info("Skipping channel startup - encryption not configured");
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
    // Stop channel adapters first
    await channelRegistry.stopAll();
    logger.info("Channel adapters stopped");
  } catch (error) {
    logger.error({ error }, "Error stopping channel adapters");
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
