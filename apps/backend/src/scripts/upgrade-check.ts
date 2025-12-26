#!/usr/bin/env tsx
/**
 * Check if upgrade is needed
 *
 * Usage:
 *   pnpm upgrade:check
 *   pnpm upgrade:check --quiet
 *
 * Exit codes:
 *   0 - Up to date
 *   1 - Upgrade needed
 *   2 - Downgrade detected (app version older than installed)
 */

// Load environment first
import "../lib/env-loader.js";

import { readFileSync, existsSync } from "fs";
import * as semver from "semver";
import { sql } from "drizzle-orm";
import { db, dbType, schema } from "../db/index.js";
import { getAppVersion, findMigrationJournal } from "./lib/version-utils.js";

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
	const quiet = process.argv.includes("--quiet");

	try {
		const migrationStatus = await checkMigrations();
		const versionStatus = await checkVersion();

		// Check for downgrade first - this is a blocking error
		if (versionStatus.isDowngrade) {
			if (!quiet) {
				console.error(
					`ERROR: App version ${appVersion} is older than installed version ${versionStatus.installed}`,
				);
				console.error(
					"Running an older version against a newer database may cause data corruption.",
				);
				console.error(`Please upgrade to at least version ${versionStatus.installed}`);
			}
			process.exit(2);
		}

		const needsUpgrade = migrationStatus.pending > 0 || versionStatus.needsUpgrade;

		if (!quiet) {
			if (migrationStatus.pending > 0) {
				console.log(`Pending migrations: ${migrationStatus.pending}`);
			}
			if (versionStatus.needsUpgrade) {
				console.log(
					`Version upgrade: ${versionStatus.installed || "fresh"} → ${appVersion}`,
				);
			}
			if (!needsUpgrade) {
				console.log("Up to date");
			}
		}

		process.exit(needsUpgrade ? 1 : 0);
	} catch (error) {
		// If we can't check (e.g., DB doesn't exist), assume upgrade needed
		if (!quiet) {
			console.log("Database not initialized - upgrade needed");
		}
		process.exit(1);
	}
}

async function checkMigrations(): Promise<{ total: number; applied: number; pending: number }> {
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
		// Drizzle stores applied migrations in __drizzle_migrations table
		const result = await db.execute(
			sql`SELECT COUNT(*) as count FROM __drizzle_migrations`,
		);

		// Handle different database result formats
		const row = Array.isArray(result) ? result[0] : (result as { rows?: unknown[] }).rows?.[0];
		if (row && typeof row === "object" && "count" in row) {
			return Number(row.count);
		}
		return 0;
	} catch {
		// Table doesn't exist - no migrations applied
		return 0;
	}
}

async function checkVersion(): Promise<{
	installed: string | null;
	needsUpgrade: boolean;
	isDowngrade: boolean;
}> {
	try {
		// Check if _app_meta table exists and get installed version
		const result = await db
			.select()
			.from(schema.appMeta)
			.where(sql`${schema.appMeta.key} = 'installed_version'`)
			.limit(1);

		const installed = result[0]?.value || null;

		if (!installed) {
			return { installed: null, needsUpgrade: true, isDowngrade: false };
		}

		const needsUpgrade = semver.gt(appVersion, installed);
		const isDowngrade = semver.lt(appVersion, installed);
		return { installed, needsUpgrade, isDowngrade };
	} catch {
		// Table doesn't exist - needs upgrade
		return { installed: null, needsUpgrade: true, isDowngrade: false };
	}
}

main();
