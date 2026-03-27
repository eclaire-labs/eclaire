/**
 * Shared API route registry.
 *
 * Single source of truth for all API route registrations. Used by both the
 * production server (index.ts) and the OpenAPI generation script.
 */

import type { Hono } from "hono";

import { adminRoutes } from "./admin.js";
import { allRoutes } from "./all.js";
import { agentsRoutes } from "./agents.js";
import { actorsRoutes } from "./actors.js";
import { speechRoutes } from "./speech.js";
import { authRoutes } from "./auth.js";
import { bookmarksRoutes } from "./bookmarks.js";
import { browserRoutes } from "./browser.js";
import { channelsRoutes } from "./channels.js";
import { documentsRoutes } from "./documents.js";
import { feedbackRoutes } from "./feedback.js";
import { historyRoutes } from "./history.js";
import { instanceRoutes } from "./instance.js";
import { modelRoutes } from "./model.js";
import { modelsRoutes } from "./models.js";
import { notesRoutes } from "./notes.js";
import { notificationsRoutes } from "./notifications.js";
import { mediaRoutes } from "./media.js";
import { photosRoutes } from "./photos.js";
import { processingEventsRoutes } from "./processing-events.js";
import { processingStatusRoutes } from "./processing-status.js";
import { scheduledActionsRoutes } from "./scheduled-actions.js";
import { sessionsRoutes } from "./sessions.js";
import { tagsRoutes } from "./tags.js";
import { taskSeriesRoutes } from "./task-series.js";
import { tasksRoutes } from "./tasks.js";
import { upcomingRoutes } from "./upcoming.js";
import { userRoutes } from "./user.js";

// biome-ignore lint/suspicious/noExplicitAny: accepts Hono app with any env type
export function registerApiRoutes(app: Hono<any>): void {
  app.route("/api/admin", adminRoutes);
  app.route("/api/auth", authRoutes);
  app.route("/api/agents", agentsRoutes);
  app.route("/api/actors", actorsRoutes);
  app.route("/api/speech", speechRoutes);
  app.route("/api/task-series", taskSeriesRoutes);
  app.route("/api/tasks", tasksRoutes);
  app.route("/api/bookmarks", bookmarksRoutes);
  app.route("/api/browser", browserRoutes);
  app.route("/api/channels", channelsRoutes);
  app.route("/api/documents", documentsRoutes);
  app.route("/api/feedback", feedbackRoutes);
  app.route("/api/notes", notesRoutes);
  app.route("/api/notifications", notificationsRoutes);
  app.route("/api/media", mediaRoutes);
  app.route("/api/photos", photosRoutes);
  app.route("/api/history", historyRoutes);
  app.route("/api/all", allRoutes);
  app.route("/api/user", userRoutes);
  app.route("/api/model", modelRoutes);
  app.route("/api/models", modelsRoutes);
  app.route("/api/sessions", sessionsRoutes);
  app.route("/api/processing-status", processingStatusRoutes);
  app.route("/api/processing-events", processingEventsRoutes);
  app.route("/api/scheduled-actions", scheduledActionsRoutes);
  app.route("/api/tags", tagsRoutes);
  app.route("/api/upcoming", upcomingRoutes);
  app.route("/api/instance", instanceRoutes);
}
