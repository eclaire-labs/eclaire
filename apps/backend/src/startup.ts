/**
 * Development mode startup wrapper
 *
 * This entry point is used for local development (pnpm dev) to check
 * database readiness before loading the main application.
 *
 * For container mode, docker-entrypoint.sh handles the check and uses
 * index.ts directly.
 */

import type { UpgradeCheckResult } from "./lib/upgrade-check.js";

// Register exception handlers first (same as index.ts)
process.on("unhandledRejection", (reason, promise) => {
	console.error("Unhandled Rejection at:", promise, "reason:", reason);
	process.exit(1);
});

process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception thrown:", error);
	process.exit(1);
});

// Load environment variables FIRST
import "./lib/env-loader.js";

// Import config module (buildConfig runs on import, we don't call initConfig here
// because index.ts will call it - avoid duplicate log output)
import "./config/index.js";

// Check database readiness before loading the main app
// This prevents cascade errors from modules trying to use unmigrated tables
// Skip in container mode - docker-entrypoint.sh handles the check
if (process.env.ECLAIRE_RUNTIME !== "container") {
	// First do lightweight sync check (does DB file exist?)
	const { checkDatabaseReady } = await import("./lib/db-ready-check.js");
	const readyResult = checkDatabaseReady();

	if (!readyResult.ready) {
		// Database doesn't exist at all - need full setup
		console.error(`Database check: ${readyResult.message}`);
		await handleFreshInstall();
	} else {
		// Database exists - do full async upgrade check
		const { checkUpgradeStatus } = await import("./lib/upgrade-check.js");
		const upgradeResult = await checkUpgradeStatus();

		switch (upgradeResult.status) {
			case "up-to-date":
				// All good, continue
				break;

			case "fresh-install":
				await handleFreshInstall();
				break;

			case "needs-upgrade":
				await handleUpgradeNeeded(upgradeResult);
				break;

			case "downgrade":
				handleDowngrade(upgradeResult);
				break;
		}
	}
}

// Database is ready - load the main application
await import("./index.js");

// --- Handler functions ---

async function handleFreshInstall(): Promise<void> {
	console.error("");
	console.error("===============================================================");
	console.error("  DATABASE NOT INITIALIZED");
	console.error("===============================================================");
	console.error("");
	console.error("  The database has not been set up yet. Please run:");
	console.error("");
	console.error("    pnpm setup:dev");
	console.error("");
	console.error("===============================================================");
	console.error("");

	// Check if running in interactive terminal
	if (process.stdin.isTTY) {
		const proceed = await promptUser("Run pnpm setup:dev now? (Y/n): ");
		if (proceed.toLowerCase() !== "n") {
			const { execSync } = await import("child_process");
			try {
				execSync("pnpm setup:dev", { stdio: "inherit", cwd: process.cwd() });
				console.log("\nSetup complete. Continuing startup...\n");
				return; // Let the app continue
			} catch {
				console.error("\nSetup failed. Please fix the issue and try again.\n");
				process.exit(1);
			}
		}
	}

	process.exit(1);
}

async function handleUpgradeNeeded(result: UpgradeCheckResult): Promise<void> {
	console.error("");
	console.error("===============================================================");
	console.error("  UPGRADE REQUIRED");
	console.error("===============================================================");
	console.error("");
	console.error(`  ${result.message}`);
	if (result.pendingMigrations > 0) {
		console.error(`  Pending migrations: ${result.pendingMigrations}`);
	}
	console.error("");
	console.error("  Please run:");
	console.error("");
	console.error("    pnpm app:upgrade");
	console.error("");
	console.error("===============================================================");
	console.error("");

	// Check if running in interactive terminal
	if (process.stdin.isTTY) {
		const proceed = await promptUser("Run pnpm app:upgrade now? (Y/n): ");
		if (proceed.toLowerCase() !== "n") {
			const { execSync } = await import("child_process");
			try {
				execSync("pnpm app:upgrade", { stdio: "inherit", cwd: process.cwd() });
				console.log("\nUpgrade complete. Continuing startup...\n");
				return; // Let the app continue
			} catch {
				console.error("\nUpgrade failed. Please fix the issue and try again.\n");
				process.exit(1);
			}
		}
	}

	process.exit(1);
}

function handleDowngrade(result: UpgradeCheckResult): never {
	console.error("");
	console.error("===============================================================");
	console.error("  FATAL: VERSION DOWNGRADE DETECTED");
	console.error("===============================================================");
	console.error("");
	console.error(`  App version:       ${result.appVersion}`);
	console.error(`  Installed version: ${result.installedVersion}`);
	console.error("");
	console.error("  Running an older version against a newer database may cause");
	console.error("  data corruption. Please upgrade to at least version");
	console.error(`  ${result.installedVersion}`);
	console.error("");
	console.error("===============================================================");
	console.error("");

	process.exit(1);
}

async function promptUser(question: string): Promise<string> {
	const readline = await import("readline");
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}
