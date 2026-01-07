/**
 * Shared upgrade check logic
 *
 * Used by:
 * - startup.ts (dev mode check with optional auto-fix)
 * - scripts/upgrade-check.ts (CLI tool)
 */

import { executeQuery, getDatabaseType } from "@eclaire/db";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import * as semver from "semver";
import {
  findMigrationJournal,
  getAppVersion,
} from "../scripts/lib/version-utils.js";
import {
  getBlockedUpgradePath,
  hasManualUpgradeRequired,
} from "../scripts/upgrades/index.js";

export interface UpgradeCheckResult {
  status:
    | "up-to-date"
    | "needs-upgrade"
    | "safe-upgrade"
    | "downgrade"
    | "fresh-install"
    | "blocked-upgrade";
  appVersion: string;
  installedVersion: string | null;
  pendingMigrations: number;
  message: string;
}

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

// Database module (dynamically imported to respect LOG_LEVEL settings)
let dbModule: typeof import("../db/index.js") | null = null;

async function getDbModule() {
  if (!dbModule) {
    dbModule = await import("../db/index.js");
  }
  return dbModule;
}

/**
 * Check the upgrade status of the database.
 * Returns a structured result instead of calling process.exit().
 */
export async function checkUpgradeStatus(): Promise<UpgradeCheckResult> {
  const appVersion = getAppVersion();

  try {
    const { db, dbType, schema } = await getDbModule();

    // Check for fresh install first
    const isFreshInstall = await checkIsFreshInstall(db, dbType);
    if (isFreshInstall) {
      return {
        status: "fresh-install",
        appVersion,
        installedVersion: null,
        pendingMigrations: 0,
        message: "Fresh install detected - initialization required",
      };
    }

    const migrationStatus = await checkMigrations(db, dbType);
    const versionStatus = await checkVersion(db, schema, appVersion);

    // Check for downgrade
    if (versionStatus.isDowngrade) {
      return {
        status: "downgrade",
        appVersion,
        installedVersion: versionStatus.installed,
        pendingMigrations: migrationStatus.pending,
        message: `App version ${appVersion} is older than installed version ${versionStatus.installed}`,
      };
    }

    const needsUpgrade =
      migrationStatus.pending > 0 || versionStatus.needsUpgrade;

    if (needsUpgrade) {
      // Check if upgrade path is blocked (no migration available)
      const blockedPath = getBlockedUpgradePath(
        versionStatus.installed,
        appVersion,
      );
      if (blockedPath.blocked) {
        return {
          status: "blocked-upgrade",
          appVersion,
          installedVersion: versionStatus.installed,
          pendingMigrations: migrationStatus.pending,
          message: blockedPath.message,
        };
      }

      // Check if any version in the upgrade path requires manual upgrade
      const requiresManual = hasManualUpgradeRequired(
        versionStatus.installed,
        appVersion,
      );

      const message = versionStatus.needsUpgrade
        ? `Upgrade needed: ${versionStatus.installed || "fresh install"} -> ${appVersion}`
        : `${migrationStatus.pending} pending migration(s)`;

      return {
        status: requiresManual ? "needs-upgrade" : "safe-upgrade",
        appVersion,
        installedVersion: versionStatus.installed,
        pendingMigrations: migrationStatus.pending,
        message,
      };
    }

    return {
      status: "up-to-date",
      appVersion,
      installedVersion: versionStatus.installed,
      pendingMigrations: 0,
      message: `Up to date (${appVersion})`,
    };
  } catch {
    // Database not accessible - treat as fresh install
    return {
      status: "fresh-install",
      appVersion,
      installedVersion: null,
      pendingMigrations: 0,
      message: "Database not accessible - treating as fresh install",
    };
  }
}

/**
 * Check if this is a fresh install (no __drizzle_migrations table exists).
 */
async function checkIsFreshInstall(
  db: Awaited<ReturnType<typeof getDbModule>>["db"],
  dbType: Awaited<ReturnType<typeof getDbModule>>["dbType"],
): Promise<boolean> {
  try {
    // Drizzle creates migrations table in 'drizzle' schema for PostgreSQL
    const migrationTable =
      dbType === "sqlite"
        ? sql`__drizzle_migrations`
        : sql`drizzle.__drizzle_migrations`;
    await executeQuery<{ count: number }>(
      db,
      dbType,
      sql`SELECT COUNT(*) as count FROM ${migrationTable}`,
    );
    return false; // Table exists, not a fresh install
  } catch {
    return true; // Table doesn't exist - fresh install
  }
}

async function checkMigrations(
  db: Awaited<ReturnType<typeof getDbModule>>["db"],
  dbType: Awaited<ReturnType<typeof getDbModule>>["dbType"],
): Promise<{ total: number; applied: number; pending: number }> {
  const journalPath = findMigrationJournal(dbType);

  if (!journalPath) {
    return { total: 0, applied: 0, pending: 0 };
  }

  const journal: Journal = JSON.parse(readFileSync(journalPath, "utf-8"));
  const total = journal.entries.length;
  const applied = await getAppliedMigrationCount(db, dbType);

  return { total, applied, pending: total - applied };
}

async function getAppliedMigrationCount(
  db: Awaited<ReturnType<typeof getDbModule>>["db"],
  dbType: Awaited<ReturnType<typeof getDbModule>>["dbType"],
): Promise<number> {
  try {
    // Drizzle creates migrations table in 'drizzle' schema for PostgreSQL
    const migrationTable =
      dbType === "sqlite"
        ? sql`__drizzle_migrations`
        : sql`drizzle.__drizzle_migrations`;
    const result = await executeQuery<{ count: number }>(
      db,
      dbType,
      sql`SELECT COUNT(*) as count FROM ${migrationTable}`,
    );
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

async function checkVersion(
  db: Awaited<ReturnType<typeof getDbModule>>["db"],
  schema: Awaited<ReturnType<typeof getDbModule>>["schema"],
  appVersion: string,
): Promise<{
  installed: string | null;
  needsUpgrade: boolean;
  isDowngrade: boolean;
}> {
  try {
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
    return { installed: null, needsUpgrade: true, isDowngrade: false };
  }
}
