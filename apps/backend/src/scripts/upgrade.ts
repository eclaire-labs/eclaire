#!/usr/bin/env tsx
/**
 * Upgrade script for Eclaire
 *
 * Usage:
 *   pnpm upgrade                    # Run all pending upgrades
 *   docker compose run --rm backend upgrade
 *
 * This script:
 * 1. Runs pending database migrations
 * 2. Runs version-specific upgrade steps
 * 3. Updates the installed version in _app_meta
 */

// Load environment first
import "../lib/env-loader.js";

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import * as semver from "semver";
import { sql, eq } from "drizzle-orm";
import { db, dbType, schema } from "../db/index.js";
import { getUpgradeSteps } from "./upgrades/index.js";
import { getAppVersion, findMigrationJournal } from "./lib/version-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get app version (uses APP_VERSION env in containers, package.json in dev)
const appVersion = getAppVersion();

interface JournalEntry {
	idx: number;
	version: string;
	when: number;
	tag: string;
}

interface Journal {
	version: string;
	dialect: string;
	entries: JournalEntry[];
}

async function main() {
	console.log(`Eclaire Upgrade`);
	console.log(`===============`);
	console.log(`App version: ${appVersion}`);
	console.log(`Database type: ${dbType}`);
	console.log("");

	try {
		// Step 1: Check current state
		const migrationStatus = await checkMigrations();
		const installedVersion = await getInstalledVersion();

		console.log(`Installed version: ${installedVersion || "(fresh install)"}`);
		console.log(`Pending migrations: ${migrationStatus.pending}`);
		console.log("");

		// Check for downgrade - refuse to "upgrade" to an older version
		if (installedVersion && semver.lt(appVersion, installedVersion)) {
			console.error(
				`ERROR: Cannot upgrade to ${appVersion} - database is already at ${installedVersion}`,
			);
			console.error(
				"Running an older version against a newer database may cause data corruption.",
			);
			console.error(`Please use version ${installedVersion} or newer.`);
			process.exit(1);
		}

		const needsMigrations = migrationStatus.pending > 0;
		const needsVersionUpgrade =
			!installedVersion || semver.gt(appVersion, installedVersion);

		if (!needsMigrations && !needsVersionUpgrade) {
			console.log("Already up to date!");
			process.exit(0);
		}

		// Step 2: Run migrations if needed
		if (needsMigrations) {
			console.log("Running database migrations...");
			await runMigrations();
			console.log("Migrations completed!");
			console.log("");
		}

		// Step 3: Ensure _app_meta table exists
		await ensureAppMetaTable();

		// Step 4: Run version-specific upgrade steps
		if (needsVersionUpgrade) {
			const fromVersion = installedVersion || "0.0.0";
			const steps = getUpgradeSteps(fromVersion, appVersion);

			if (steps.length > 0) {
				console.log(
					`Running ${steps.length} upgrade step(s) from ${fromVersion} to ${appVersion}...`,
				);
				for (const step of steps) {
					console.log(`  → ${step.version}: ${step.description}`);
					await step.run(db as Parameters<typeof step.run>[0]);
				}
				console.log("Upgrade steps completed!");
				console.log("");
			}
		}

		// Step 5: Update installed version
		await setInstalledVersion(appVersion);

		console.log(`Upgraded to ${appVersion}`);
	} catch (error) {
		console.error("Upgrade failed:", error);
		process.exit(1);
	}
}

async function checkMigrations(): Promise<{
	total: number;
	applied: number;
	pending: number;
}> {
	// Find migration journal (checks multiple paths for container vs dev)
	const journalPath = findMigrationJournal(dbType);

	if (!journalPath) {
		// No journal found in any location
		return { total: 0, applied: 0, pending: 0 };
	}

	const journal: Journal = JSON.parse(readFileSync(journalPath, "utf-8"));
	const total = journal.entries.length;
	const applied = await getAppliedMigrationCount();

	return { total, applied, pending: total - applied };
}

async function getAppliedMigrationCount(): Promise<number> {
	try {
		const result = await db.execute(
			sql`SELECT COUNT(*) as count FROM __drizzle_migrations`,
		);

		const row = Array.isArray(result)
			? result[0]
			: (result as { rows?: unknown[] }).rows?.[0];
		if (row && typeof row === "object" && "count" in row) {
			return Number(row.count);
		}
		return 0;
	} catch {
		return 0;
	}
}

async function getInstalledVersion(): Promise<string | null> {
	try {
		const result = await db
			.select()
			.from(schema.appMeta)
			.where(eq(schema.appMeta.key, "installed_version"))
			.limit(1);

		return result[0]?.value || null;
	} catch {
		// Table doesn't exist yet
		return null;
	}
}

async function runMigrations(): Promise<void> {
	// Call the existing migration script
	const migrateScript = resolve(
		__dirname,
		"../../../node_modules/@eclaire/db/dist/scripts/migrate.js",
	);

	// Check if dist version exists, otherwise use source
	const scriptPath = existsSync(migrateScript)
		? migrateScript
		: resolve(__dirname, "../../../../packages/db/src/scripts/migrate.ts");

	const isTs = scriptPath.endsWith(".ts");
	const cmd = isTs ? `npx tsx ${scriptPath} --force` : `node ${scriptPath} --force`;

	execSync(cmd, {
		stdio: "inherit",
		env: process.env,
	});
}

async function ensureAppMetaTable(): Promise<void> {
	// The _app_meta table should be created by migrations since it's in the schema.
	// But if running before migrations are applied, we need to create it manually.
	try {
		// Try to select from the table to see if it exists
		await db.select().from(schema.appMeta).limit(1);
	} catch {
		// Table doesn't exist, create it
		console.log("Creating _app_meta table...");

		if (dbType === "sqlite") {
			await db.execute(sql`
				CREATE TABLE IF NOT EXISTS "_app_meta" (
					"key" text PRIMARY KEY NOT NULL,
					"value" text NOT NULL,
					"updated_at" integer NOT NULL DEFAULT (unixepoch())
				)
			`);
		} else {
			await db.execute(sql`
				CREATE TABLE IF NOT EXISTS "_app_meta" (
					"key" text PRIMARY KEY NOT NULL,
					"value" text NOT NULL,
					"updated_at" timestamp NOT NULL DEFAULT now()
				)
			`);
		}
	}
}

async function setInstalledVersion(version: string): Promise<void> {
	// Upsert the installed_version
	const existing = await db
		.select()
		.from(schema.appMeta)
		.where(eq(schema.appMeta.key, "installed_version"))
		.limit(1);

	if (existing.length > 0) {
		await db
			.update(schema.appMeta)
			.set({ value: version, updatedAt: new Date() })
			.where(eq(schema.appMeta.key, "installed_version"));
	} else {
		await db.insert(schema.appMeta).values({
			key: "installed_version",
			value: version,
		});
	}
}

main();
