/**
 * Version-specific upgrade steps registry
 *
 * Add upgrade steps here when a release requires data transformations
 * beyond what database migrations handle.
 *
 * Example:
 *   {
 *     version: '0.7.0',
 *     description: 'Migrate bookmark storage format',
 *     run: async (db) => {
 *       // Transform data...
 *     }
 *   }
 */

import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as semver from "semver";

// Union type for all supported database types
export type Database =
  | BetterSQLite3Database<Record<string, unknown>>
  | PgliteDatabase<Record<string, unknown>>
  | PostgresJsDatabase<Record<string, unknown>>;

export interface UpgradeStep {
  version: string; // Target version (e.g., '0.7.0')
  description: string;
  /** If true, blocks automatic upgrade - user must run upgrade command manually */
  requiresManualUpgrade?: boolean;
  /** If true, upgrades from prior versions are completely blocked (no migration path) */
  blocksUpgradePath?: boolean;
  /** Message to show when upgrade path is blocked */
  blockedUpgradeMessage?: string;
  /** Optional data migration function (can be omitted for marker-only entries) */
  run?: (db: Database) => Promise<void>;
}

/**
 * Registry of version-specific upgrade steps.
 * Steps are run in order for versions between installed and target.
 */
export const upgradeSteps: UpgradeStep[] = [
  {
    version: "0.6.0",
    description: "Breaking release - no automated migration from prior versions",
    blocksUpgradePath: true,
    blockedUpgradeMessage: `There is no automated upgrade path from prior versions to 0.6.0.
See CHANGELOG.md for migration instructions.`,
  },
];

/**
 * Get upgrade steps that need to run between two versions.
 */
export function getUpgradeSteps(
  fromVersion: string,
  toVersion: string,
): UpgradeStep[] {
  return upgradeSteps
    .filter((step) => {
      const stepVersion = semver.valid(step.version);
      const from = semver.valid(fromVersion);
      const to = semver.valid(toVersion);

      if (!stepVersion || !from || !to) return false;

      // Include step if its version is > fromVersion AND <= toVersion
      return semver.gt(stepVersion, from) && semver.lte(stepVersion, to);
    })
    .sort((a, b) => semver.compare(a.version, b.version));
}

/**
 * Check if any upgrade step between two versions requires manual upgrade.
 */
export function hasManualUpgradeRequired(
  fromVersion: string | null,
  toVersion: string,
): boolean {
  const steps = getUpgradeSteps(fromVersion || "0.0.0", toVersion);
  return steps.some((step) => step.requiresManualUpgrade === true);
}

/**
 * Check if the upgrade path between two versions is blocked (no migration available).
 */
export function getBlockedUpgradePath(
  fromVersion: string | null,
  toVersion: string,
): { blocked: boolean; message: string } {
  const steps = getUpgradeSteps(fromVersion || "0.0.0", toVersion);
  const blockedStep = steps.find((step) => step.blocksUpgradePath === true);

  if (blockedStep) {
    return {
      blocked: true,
      message:
        blockedStep.blockedUpgradeMessage ||
        `Upgrade to ${blockedStep.version} is not supported from prior versions.`,
    };
  }

  return { blocked: false, message: "" };
}
