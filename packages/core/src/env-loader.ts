// Shared environment loader for Eclaire
//
// MUST be imported BEFORE any other modules that need environment variables.
// This module is idempotent - safe to import multiple times.
//
// In containers (ECLAIRE_RUNTIME=container):
//   Env vars are injected by Docker Compose via env_file + environment
//   No .env file exists in the container - this loader is a no-op
//
// In local development (ECLAIRE_RUNTIME=local or unset):
//   Load .env from repo root
//   Set default runtime context if not already set

const isContainer = process.env.ECLAIRE_RUNTIME === "container";

/**
 * Information about which environment sources were loaded.
 * Used by config modules to determine secrets source.
 */
export const envLoadInfo = {
  isContainer,
  envLoaded: false,
  /** @deprecated .env.local is no longer supported - use .env */
  envLocalLoaded: false,
};

// Track if we've already loaded to make this idempotent
let loaded = false;

const isTest = process.env.NODE_ENV === "test";

if (!isContainer && !isTest && !loaded) {
  loaded = true;

  // Local development - load .env from repo root
  const dotenv = await import("dotenv");
  const path = await import("node:path");
  const fs = await import("node:fs");

  // Find the repo root by looking for .env or .env.example
  let rootDir = process.cwd();

  // Walk up the directory tree to find repo root
  let dir = rootDir;
  for (let i = 0; i < 10; i++) {
    const envPath = path.join(dir, ".env");
    const examplePath = path.join(dir, ".env.example");
    if (fs.existsSync(envPath) || fs.existsSync(examplePath)) {
      rootDir = dir;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // Reached filesystem root
    dir = parent;
  }

  const envPath = path.join(rootDir, ".env");

  // Load .env (user config with secrets)
  // Use override: false so explicit process.env variables take precedence
  if (fs.existsSync(envPath)) {
    dotenv.config({
      path: envPath,
      override: false,
    });
    envLoadInfo.envLoaded = true;
  }

  // Set local defaults if not already set
  process.env.ECLAIRE_RUNTIME ??= "local";
  process.env.ECLAIRE_HOME ??= rootDir;
}

/** Flag to verify this module was imported */
export const ENV_LOADED = true;
