/**
 * Core upgrade logic - can be called from CLI or during startup
 */

import { execSync } from "child_process";
import { eq } from "drizzle-orm";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import * as semver from "semver";
import {
  findMigrationJournal,
  getAppVersion,
} from "../scripts/lib/version-utils.js";
import {
  getBlockedUpgradePath,
  getUpgradeSteps,
} from "../scripts/upgrades/index.js";

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

export interface RunUpgradeOptions {
  /** If true, print verbose output (default: true) */
  verbose?: boolean;
  /** If true, close database connection after upgrade (default: false) */
  closeDb?: boolean;
}

export interface RunUpgradeResult {
  success: boolean;
  fromVersion: string | null;
  toVersion: string;
  migrationsRun: number;
  upgradeStepsRun: number;
  error?: Error;
}

/**
 * Run database migrations and upgrade steps.
 * Returns result instead of calling process.exit().
 */
export async function runUpgrade(
  options: RunUpgradeOptions = {},
): Promise<RunUpgradeResult> {
  const { verbose = true, closeDb = false } = options;
  const log = verbose ? console.log.bind(console) : () => {};

  // Declare variables outside try so they're accessible in catch for cleanup
  let db: Awaited<typeof import("../db/index.js")>["db"] | undefined;
  let dbType: Awaited<typeof import("../db/index.js")>["dbType"] | undefined;
  let schema: Awaited<typeof import("../db/index.js")>["schema"] | undefined;
  let closeDatabase:
    | Awaited<typeof import("../db/index.js")>["closeDatabase"]
    | undefined;
  let appVersion = "unknown";

  try {
    // These can throw - must be inside try-catch for proper error handling
    appVersion = getAppVersion();

    // Import db module
    ({ db, dbType, schema, closeDatabase } = await import("../db/index.js"));

    log(`Auto-upgrading to ${appVersion}...`);

    // After successful import, these are guaranteed to be defined
    // Check current state
    const migrationStatus = await checkMigrations(db!, dbType!);
    const installedVersion = await getInstalledVersion(db!, schema!);

    if (verbose) {
      log(`  From: ${installedVersion || "(fresh)"}`);
      log(`  Pending migrations: ${migrationStatus.pending}`);
    }

    // Check for downgrade
    if (installedVersion && semver.lt(appVersion, installedVersion)) {
      throw new Error(
        `Cannot upgrade to ${appVersion} - database is already at ${installedVersion}`,
      );
    }

    // Check for blocked upgrade path (no migration available)
    const blockedPath = getBlockedUpgradePath(installedVersion, appVersion);
    if (blockedPath.blocked) {
      throw new Error(blockedPath.message);
    }

    const needsMigrations = migrationStatus.pending > 0;
    const needsVersionUpgrade =
      !installedVersion || semver.gt(appVersion, installedVersion);

    if (!needsMigrations && !needsVersionUpgrade) {
      log("  Already up to date!");
      return {
        success: true,
        fromVersion: installedVersion,
        toVersion: appVersion,
        migrationsRun: 0,
        upgradeStepsRun: 0,
      };
    }

    // Run migrations if needed
    if (needsMigrations) {
      log("  Running database migrations...");
      await runMigrations();
    }

    // Run version-specific upgrade steps
    let upgradeStepsRun = 0;
    if (needsVersionUpgrade) {
      const fromVersion = installedVersion || "0.0.0";
      const steps = getUpgradeSteps(fromVersion, appVersion);

      for (const step of steps) {
        if (step.run) {
          log(`  → ${step.version}: ${step.description}`);
          await step.run(db! as Parameters<typeof step.run>[0]);
          upgradeStepsRun++;
        }
      }
    }

    // Update installed version
    await setInstalledVersion(db!, schema!, appVersion);

    if (closeDb) {
      await closeDatabase!();
    }

    log(`  Upgraded to ${appVersion}`);

    return {
      success: true,
      fromVersion: installedVersion,
      toVersion: appVersion,
      migrationsRun: migrationStatus.pending,
      upgradeStepsRun,
    };
  } catch (error) {
    // Try to close database if it was initialized and closeDb was requested
    if (closeDb && closeDatabase) {
      try {
        await closeDatabase();
      } catch {
        // Ignore cleanup errors
      }
    }
    return {
      success: false,
      fromVersion: null,
      toVersion: appVersion,
      migrationsRun: 0,
      upgradeStepsRun: 0,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function checkMigrations(
  db: Awaited<typeof import("../db/index.js")>["db"],
  dbType: Awaited<typeof import("../db/index.js")>["dbType"],
): Promise<{ total: number; applied: number; pending: number }> {
  const { sql } = await import("drizzle-orm");
  const { executeQuery } = await import("@eclaire/db");

  const journalPath = findMigrationJournal(dbType);

  if (!journalPath) {
    return { total: 0, applied: 0, pending: 0 };
  }

  const journal: Journal = JSON.parse(readFileSync(journalPath, "utf-8"));
  const total = journal.entries.length;

  // Get applied count
  let applied = 0;
  try {
    const migrationTable =
      dbType === "sqlite"
        ? sql`__drizzle_migrations`
        : sql`drizzle.__drizzle_migrations`;
    const result = await executeQuery<{ count: number }>(
      db,
      dbType,
      sql`SELECT COUNT(*) as count FROM ${migrationTable}`,
    );
    applied = Number(result[0]?.count ?? 0);
  } catch {
    applied = 0;
  }

  return { total, applied, pending: total - applied };
}

async function getInstalledVersion(
  db: Awaited<typeof import("../db/index.js")>["db"],
  schema: Awaited<typeof import("../db/index.js")>["schema"],
): Promise<string | null> {
  try {
    const result = await db
      .select()
      .from(schema.appMeta)
      .where(eq(schema.appMeta.key, "installed_version"))
      .limit(1);

    return result[0]?.value || null;
  } catch {
    return null;
  }
}

async function runMigrations(): Promise<void> {
  const isContainer = process.env.ECLAIRE_RUNTIME === "container";

  let scriptPath: string;
  let cmd: string;

  if (isContainer) {
    // Container: pnpm deploy puts @eclaire/db in node_modules
    // Code runs from /app/dist/src/lib/, script is at /app/node_modules/...
    scriptPath = resolve(
      import.meta.dirname,
      "../../../node_modules/@eclaire/db/dist/scripts/migrate.js",
    );
    cmd = `node ${scriptPath} --force`;
  } else {
    // Local dev: use monorepo packages directly with tsx
    // Code runs from apps/backend/src/lib/, script is at packages/db/...
    scriptPath = resolve(
      import.meta.dirname,
      "../../../../packages/db/src/scripts/migrate.ts",
    );
    cmd = `pnpm exec tsx ${scriptPath} --force`;
  }

  if (!existsSync(scriptPath)) {
    throw new Error(`Migration script not found at: ${scriptPath}`);
  }

  execSync(cmd, {
    stdio: "inherit",
    env: process.env,
  });
}

async function setInstalledVersion(
  db: Awaited<typeof import("../db/index.js")>["db"],
  schema: Awaited<typeof import("../db/index.js")>["schema"],
  version: string,
): Promise<void> {
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
