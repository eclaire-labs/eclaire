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
	run: (db: Database) => Promise<void>;
}

/**
 * Registry of version-specific upgrade steps.
 * Steps are run in order for versions between installed and target.
 */
export const upgradeSteps: UpgradeStep[] = [
	// Example for future releases:
	// {
	//   version: '0.7.0',
	//   description: 'Migrate bookmark storage format',
	//   run: async (db) => {
	//     // Your data transformation logic here
	//   }
	// },
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
