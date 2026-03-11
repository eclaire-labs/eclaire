/**
 * Generate a static OpenAPI JSON file without starting the HTTP server.
 *
 * Uses the shared route registry and calls generateSpecs() directly,
 * then writes the resulting JSON to dist/openapi.json.
 *
 * Run with:  pnpm run generate:openapi  (see package.json)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Load environment variables so route modules behave the same as in production
import "@eclaire/core";

import { Hono } from "hono";
import { generateSpecs } from "hono-openapi";
import { openAPIDocumentation } from "../src/lib/openapi-config.js";
import { registerApiRoutes } from "../src/routes/registry.js";

async function main() {
  const app = new Hono();

  // Register all API routes from the shared registry
  registerApiRoutes(app);

  // Generate the spec directly — no dummy context needed
  const spec = await generateSpecs(app, {
    documentation: openAPIDocumentation,
  });

  const json = JSON.stringify(spec, null, 2);

  const outputPath = resolve(import.meta.dirname, "../dist/openapi.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, "utf8");

  console.log(`OpenAPI spec written to ${outputPath}`);

  // Gracefully close any Redis/BullMQ connections that may have been opened
  try {
    const { closeQueues } = await import("../src/lib/queue/index.js");
    await closeQueues();
  } catch (err) {
    console.warn("Failed to close queues cleanly:", err);
  }

  process.exit(0);
}

main().catch(async (err) => {
  console.error("Failed to generate OpenAPI spec:", err);
  try {
    const { closeQueues } = await import("../src/lib/queue/index.js");
    await closeQueues();
  } catch {
    // Ignore cleanup errors during error handling
  }
  process.exit(1);
});
