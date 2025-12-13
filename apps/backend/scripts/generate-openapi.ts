/**
 * Generate a static OpenAPI JSON file without starting the HTTP server.
 *
 * This script rebuilds a lightweight Hono application in-memory, registers
 * the exact same route modules used by the runtime server, and then asks
 * hono-openapi for the spec. The resulting JSON is written to the
 * frontend's public directory so the docs site can load it at build-time
 * without depending on a live backend.
 *
 * Run with:  pnpm run generate:openapi  (see package.json)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Environment – make sure the usual .env.* logic is applied so that any route
// module relying on environment variables behaves the same as in production.
// ---------------------------------------------------------------------------
import "../src/lib/env-loader";

// ---------------------------------------------------------------------------
// Hono app + routes – replicate the server's route tree (no middlewares that
// are not required for spec generation).
// ---------------------------------------------------------------------------
import { Hono } from "hono";
import { getOpenAPIDocument } from "../src/lib/openapi-config.js";
import { allRoutes } from "../src/routes/all.js";
import { bookmarksRoutes } from "../src/routes/bookmarks.js";
import { conversationsRoutes } from "../src/routes/conversations.js";
import { documentsRoutes } from "../src/routes/documents.js";
import { historyRoutes } from "../src/routes/history.js";
import { modelRoutes } from "../src/routes/model.js";
import { notesRoutes } from "../src/routes/notes.js";
import { photosRoutes } from "../src/routes/photos.js";
import { processingEventsRoutes } from "../src/routes/processing-events.js";
import { processingStatusRoutes } from "../src/routes/processing-status.js";
import { promptRoutes } from "../src/routes/prompt.js";
import { tasksRoutes } from "../src/routes/tasks.js";
import { userRoutes } from "../src/routes/user.js";

async function main() {
  const app = new Hono();

  // Register API routes exactly as in the real server
  app.route("/api/tasks", tasksRoutes);
  app.route("/api/bookmarks", bookmarksRoutes);
  app.route("/api/conversations", conversationsRoutes);
  app.route("/api/documents", documentsRoutes);
  app.route("/api/notes", notesRoutes);
  app.route("/api/photos", photosRoutes);
  app.route("/api/history", historyRoutes);
  app.route("/api/all", allRoutes);
  app.route("/api/user", userRoutes);
  app.route("/api/model", modelRoutes);
  app.route("/api/prompt", promptRoutes);
  app.route("/api/processing-status", processingStatusRoutes);
  app.route("/api/processing-events", processingEventsRoutes);

  // Generate the spec
  const openApiMiddleware = getOpenAPIDocument(app);

  // Call the middleware with a stubbed Hono Context to capture the spec.
  let spec: unknown;
  const dummyContext = {
    // The middleware will call `json` on the context with the spec object.
    json: (obj: unknown) => {
      spec = obj;
      // Return value doesn't matter for our purposes.
      return obj as never;
    },
  } as unknown;

  // Execute the middleware once to populate `spec`.
  // We ignore the `next` function because the middleware ends the chain.
  await (openApiMiddleware as any)(dummyContext, () => Promise.resolve());

  if (!spec) {
    throw new Error(
      "Failed to generate OpenAPI spec: middleware returned no data",
    );
  }

  // Pretty-print for readability.
  const json = JSON.stringify(spec, null, 2);

  // Write to backend dist directory - keep the spec where it's generated
  const outputPath = resolve(__dirname, "../dist/openapi.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, "utf8");

  console.log(`✅ OpenAPI spec written to ${outputPath}`);

  // Gracefully close any Redis/BullMQ connections that may have been opened
  // Import closeQueues only when needed to avoid initializing Redis during build
  try {
    const { closeQueues } = await import("../src/lib/queues.js");
    await closeQueues();
  } catch (err) {
    console.warn("⚠️  Failed to close queues cleanly:", err);
  }

  // Ensure the process exits even if some handles are still keeping Node alive
  process.exit(0);
}

main().catch(async (err) => {
  console.error("❌ Failed to generate OpenAPI spec:", err);
  // Attempt to close queues before exiting with error
  try {
    const { closeQueues } = await import("../src/lib/queues.js");
    await closeQueues();
  } catch {
    // Ignore cleanup errors during error handling
  }
  process.exit(1);
});
