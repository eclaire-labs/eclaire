#!/usr/bin/env tsx
/**
 * Upgrade script for Eclaire
 *
 * Usage:
 *   pnpm app:upgrade                # Run all pending upgrades
 *   docker compose run --rm backend upgrade
 *
 * This script:
 * 1. Runs pending database migrations
 * 2. Runs version-specific upgrade steps
 * 3. Updates the installed version in _app_meta
 */

// Global error handlers - must be set up before any async code
process.on("unhandledRejection", (reason) => {
  console.error("Upgrade failed (unhandled rejection):", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Upgrade failed (uncaught exception):", error);
  process.exit(1);
});

// Load environment first
import "../lib/env-loader.js";

// Suppress noisy db initialization logs for this script
process.env.LOG_LEVEL = "error";

import { runUpgrade } from "../lib/run-upgrade.js";
import { getAppVersion } from "./lib/version-utils.js";

async function main() {
  const appVersion = getAppVersion();

  console.log(`Eclaire Upgrade`);
  console.log(`===============`);
  console.log(`Target version: ${appVersion}`);
  console.log("");

  const result = await runUpgrade({ verbose: true, closeDb: true });

  if (!result.success) {
    console.error("");
    console.error("Upgrade failed:", result.error?.message || "Unknown error");
    process.exit(1);
  }

  console.log("");
  console.log("═══════════════════════════════════════");
  console.log(`  Upgraded to ${result.toVersion}`);
  console.log("═══════════════════════════════════════");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Upgrade failed:", error);
    process.exit(1);
  });
