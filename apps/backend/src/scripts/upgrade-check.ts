#!/usr/bin/env tsx
/**
 * Check if upgrade is needed
 *
 * Usage:
 *   pnpm app:upgrade-check
 *   pnpm app:upgrade-check --quiet
 *
 * Exit codes:
 *   0 - Up to date
 *   1 - Upgrade needed (manual upgrade required - has breaking changes)
 *   2 - Downgrade detected (app version older than installed)
 *   3 - Fresh install (no database tables exist)
 *   4 - Safe upgrade (can be auto-applied without manual intervention)
 *   5 - Blocked upgrade (no migration path from prior version)
 */

// Global error handlers - must be set up before any async code
process.on("unhandledRejection", (reason) => {
  console.error("Upgrade check failed (unhandled rejection):", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Upgrade check failed (uncaught exception):", error);
  process.exit(1);
});

// Load environment first
import "../lib/env-loader.js";

// Suppress noisy db initialization logs for this check script
process.env.LOG_LEVEL = "error";

import { checkUpgradeStatus } from "../lib/upgrade-check.js";

async function main() {
  const quiet = process.argv.includes("--quiet");

  const result = await checkUpgradeStatus();

  switch (result.status) {
    case "up-to-date":
      if (!quiet) console.log(result.message);
      process.exit(0);
      break;

    case "fresh-install":
      if (!quiet) console.log(result.message);
      process.exit(3);
      break;

    case "needs-upgrade":
      if (!quiet) {
        console.log("");
        console.log("═══════════════════════════════════════");
        console.log(`  ${result.message}`);
        if (result.pendingMigrations > 0) {
          console.log(`  Pending migrations: ${result.pendingMigrations}`);
        }
        console.log("");
        console.log("  This version requires manual upgrade.");
        console.log("  Run: pnpm app:upgrade");
        console.log("═══════════════════════════════════════");
        console.log("");
      }
      process.exit(1);
      break;

    case "safe-upgrade":
      if (!quiet) {
        console.log(`${result.message} (safe to auto-apply)`);
      }
      process.exit(4);
      break;

    case "downgrade":
      if (!quiet) {
        console.error(`ERROR: ${result.message}`);
        console.error(
          "Running an older version against a newer database may cause data corruption.",
        );
        console.error(
          `Please upgrade to at least version ${result.installedVersion}`,
        );
      }
      process.exit(2);
      break;

    case "blocked-upgrade":
      if (!quiet) {
        console.log("");
        console.log("═══════════════════════════════════════════════════════════");
        console.log("  Upgrade from prior versions is not supported.");
        console.log("");
        console.log(`  ${result.message.split("\n").join("\n  ")}`);
        console.log("═══════════════════════════════════════════════════════════");
        console.log("");
      }
      process.exit(5);
      break;
  }
}

main().catch((error) => {
  console.error("Upgrade check failed:", error);
  process.exit(1);
});
