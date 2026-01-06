/**
 * Shared utilities for upgrade scripts
 * Handles version resolution and migration journal lookup across different environments
 * (container vs local dev, pnpm deploy vs monorepo)
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Get the app version from the best available source:
 * 1. APP_VERSION env var (required in container builds via Dockerfile)
 * 2. Root package.json (local dev/monorepo)
 *
 * In containers, pnpm deploy replaces package.json with the backend package
 * which has version 0.0.0, so APP_VERSION must be set at build time.
 * Containers must be built with scripts/build.sh to ensure proper versioning.
 */
export function getAppVersion(): string {
  // In container context, APP_VERSION is required (set by scripts/build.sh)
  if (process.env.ECLAIRE_RUNTIME === "container") {
    if (!process.env.APP_VERSION || process.env.APP_VERSION === "N/A") {
      throw new Error(
        "APP_VERSION not set. Container must be built with scripts/build.sh to set proper version.",
      );
    }
    return process.env.APP_VERSION;
  }

  // Local dev: prefer APP_VERSION if set, otherwise read from package.json
  if (process.env.APP_VERSION && process.env.APP_VERSION !== "N/A") {
    return process.env.APP_VERSION;
  }

  // Fallback to package.json (local dev)
  // Path: lib/version-utils.ts -> scripts -> src -> backend -> apps -> monorepo root
  const rootPackageJson = resolve(
    import.meta.dirname,
    "../../../../../package.json",
  );
  try {
    return JSON.parse(readFileSync(rootPackageJson, "utf-8")).version;
  } catch {
    throw new Error(
      `Cannot determine app version: APP_VERSION env not set and ${rootPackageJson} not found`,
    );
  }
}

/**
 * Migration journal paths to check, in order of priority.
 * Different paths are valid depending on the environment:
 *
 * Container (pnpm deploy):
 *   - node_modules/@eclaire/db/src/migrations (bundled by pnpm deploy)
 *   - /app/migrations (explicit copy in Dockerfile)
 *
 * Local dev (monorepo):
 *   - node_modules/@eclaire/db/dist/migrations (if packages are built)
 *   - packages/db/src/migrations (linked workspace packages)
 */
function getMigrationPaths(): string[] {
  // Path: lib/version-utils.ts -> scripts -> src -> backend
  const backendRoot = resolve(import.meta.dirname, "../../../..");

  return [
    // Container: pnpm deploy bundles @eclaire/db with src/
    resolve(backendRoot, "node_modules/@eclaire/db/src/migrations"),
    // Container: explicit copy in Dockerfile to /app/migrations
    resolve(backendRoot, "migrations"),
    // Local dev with built packages
    resolve(backendRoot, "node_modules/@eclaire/db/dist/migrations"),
    // Local dev with linked packages (monorepo)
    resolve(backendRoot, "../packages/db/src/migrations"),
  ];
}

/**
 * Database dialect types (matches @eclaire/db DbDialect)
 */
type DbDialect = "postgres" | "pglite" | "sqlite";

/**
 * Find the migration journal file for the given database type.
 * Checks multiple paths to handle container vs local dev environments.
 *
 * @param dbType - Database dialect (postgres, pglite, or sqlite)
 * @returns Path to the journal file, or null if not found
 */
export function findMigrationJournal(dbType: DbDialect): string | null {
  // Map dialect to migration folder name (postgres and pglite both use postgres migrations)
  const subdir = dbType === "sqlite" ? "sqlite" : "postgres";

  for (const basePath of getMigrationPaths()) {
    const journalPath = resolve(basePath, subdir, "meta/_journal.json");
    if (existsSync(journalPath)) {
      return journalPath;
    }
  }

  return null;
}
