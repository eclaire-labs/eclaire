// Load environment variables BEFORE any other imports that need them
//
// In containers (ECLAIRE_RUNTIME=container):
//   Env vars are injected by Docker Compose via env_file + environment
//   No .env file exists in the container - this loader is a no-op
//
// In local development (ECLAIRE_RUNTIME=local or unset):
//   Load .env from repo root for convenience
//   Set default runtime context if not already set

const isContainer = process.env.ECLAIRE_RUNTIME === "container";

if (!isContainer) {
  // Local development - load .env from repo root
  const dotenv = await import("dotenv");
  const path = await import("path");
  const fs = await import("fs");

  // Find the repo root by looking for .env or package.json
  let rootDir = process.cwd();

  // If we're in apps/backend, go up to repo root
  if (rootDir.endsWith("apps/backend") || rootDir.includes("apps/backend")) {
    // Try to find repo root
    let dir = rootDir;
    for (let i = 0; i < 5; i++) {
      const envPath = path.join(dir, ".env");
      const examplePath = path.join(dir, ".env.example");
      if (fs.existsSync(envPath) || fs.existsSync(examplePath)) {
        rootDir = dir;
        break;
      }
      dir = path.dirname(dir);
    }
  }

  const envPath = path.join(rootDir, ".env");
  const envLocalPath = path.join(rootDir, ".env.local");

  // Load .env first (user config)
  if (fs.existsSync(envPath)) {
    dotenv.config({
      path: envPath,
      override: true,
    });
  }

  // Load .env.local second (auto-generated secrets, gitignored)
  // This allows auto-generated secrets to persist across restarts
  // Skip in test mode to ensure reproducible TEST_SECRETS are used
  const isTest = process.env.NODE_ENV === "test";
  if (!isTest && fs.existsSync(envLocalPath)) {
    dotenv.config({
      path: envLocalPath,
      override: true,
    });
  }

  // Set local defaults if not already set
  process.env.ECLAIRE_RUNTIME ??= "local";
  process.env.ECLAIRE_HOME ??= rootDir;
}

// Export a flag to ensure this module was loaded
export const ENV_LOADED = true;
