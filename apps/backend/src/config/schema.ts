/**
 * Configuration Schema
 *
 * This is the single source of truth for all configuration.
 * Environment variables are loaded, validated, and transformed here.
 *
 * Three layers of config:
 * 1. User intent (from .env): secrets, feature choices, external URLs
 * 2. Deployment wiring (from compose/runtime): hostnames, ports, paths
 * 3. Derived config (computed): connection strings, full paths
 */

import * as fs from "fs";
import * as path from "path";
import { envLoadInfo } from "../lib/env-loader.js";

export type EclaireRuntime = "local" | "container";
export type SecretsSource = "auto-generated" | "env-local" | "env" | "environment";
export type DatabaseType = "sqlite" | "pglite" | "postgresql";
export type QueueBackend = "sqlite" | "postgres" | "redis";
export type ServiceRole = "api" | "worker" | "all";

export interface EclaireConfig {
  // Runtime context
  runtime: EclaireRuntime;
  home: string;
  nodeEnv: string;
  isProduction: boolean;
  isContainer: boolean;

  // Server
  port: number;
  host: string;
  logLevel: string;

  // Service configuration
  serviceRole: ServiceRole;
  databaseType: DatabaseType;
  queueBackend: QueueBackend;

  // Database
  database: {
    type: DatabaseType;
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    url: string; // Full connection string
    sqlitePath: string;
    pgliteDir: string;
  };

  // Queue
  queue: {
    backend: QueueBackend;
    redisUrl: string;
    redisKeyPrefix: string;
  };

  // Directories
  dirs: {
    data: string;
    config: string;
    users: string;
    logs: string;
    browserData: string;
    frontendDist: string | null; // null = use auto-detection
  };

  // Storage
  storage: {
    backend: "local" | "s3";
  };

  // AI Settings (provider URLs moved to config/ai/providers.json)
  ai: {
    debugLogPath?: string;
    timeout: number;
  };

  // Worker
  worker: {
    port: number;
    concurrency: number;
    sharedDataPath: string;
  };

  // External services
  services: {
    doclingUrl: string;
    frontendUrl: string;
    backendUrl: string;
  };

  // Security
  security: {
    betterAuthSecret: string;
    masterEncryptionKey: string;
    apiKeyHmacVersion: string;
    apiKeyHmacKeyV1: string;
    secretsSource: SecretsSource; // Where secrets were loaded from
  };

  // Timeouts (for browser operations)
  timeouts: {
    browserContext: number;
    pageNavigation: number;
    screenshotDesktop: number;
    screenshotFullpage: number;
    screenshotMobile: number;
    pdfGeneration: number;
  };
}

/**
 * Get a required environment variable or throw
 */
function required(key: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Parse an integer with a default
 */
function int(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse a boolean
 */
function bool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

/**
 * Generate a random hex string (for auto-generating dev secrets)
 */
function generateHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Well-known test secrets (only used when NODE_ENV=test)
 * These are intentionally weak and predictable for reproducible testing.
 * NEVER use these values in production.
 */
const TEST_SECRETS = {
  betterAuthSecret: "test-auth-secret-32-characters!!!",
  masterEncryptionKey:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  apiKeyHmacKeyV1: "test-hmac-key-32-characters!!!!!",
};

/**
 * Persist auto-generated secrets to .env.local so they survive restarts.
 * This enables "pnpm dev just works" without requiring manual setup.
 */
function persistSecretsToEnvLocal(
  secrets: {
    betterAuthSecret: string;
    masterEncryptionKey: string;
    apiKeyHmacKeyV1: string;
  },
  home: string,
): void {
  const envLocalPath = path.join(home, ".env.local");

  const lines = [
    "# Auto-generated secrets for development (gitignored)",
    "# Delete this file to regenerate secrets",
    "",
    `BETTER_AUTH_SECRET=${secrets.betterAuthSecret}`,
    `MASTER_ENCRYPTION_KEY=${secrets.masterEncryptionKey}`,
    `API_KEY_HMAC_KEY_V1=${secrets.apiKeyHmacKeyV1}`,
    "",
  ];

  try {
    fs.writeFileSync(envLocalPath, lines.join("\n"));
  } catch {
    // Silently fail if we can't write - not critical for operation
  }
}

/**
 * Build the configuration from environment variables
 */
export function buildConfig(): EclaireConfig {
  const env = process.env;

  // Runtime context
  const runtime = (env.ECLAIRE_RUNTIME || "local") as EclaireRuntime;
  const isContainer = runtime === "container";
  const isProduction = env.NODE_ENV === "production";

  // Home directory - anchor for all paths
  const home = env.ECLAIRE_HOME || (isContainer ? "/app" : ".");

  // Database wiring defaults based on runtime
  const defaultDbHost = isContainer ? "postgres" : "127.0.0.1";
  const defaultRedisHost = isContainer ? "redis" : "127.0.0.1";
  const defaultBackendUrl = isContainer
    ? "http://eclaire:3000"
    : "http://127.0.0.1:3001";
  const defaultDoclingUrl = isContainer
    ? "http://docling:5001"
    : "http://127.0.0.1:5001";

  // Service configuration
  const serviceRole = (env.SERVICE_ROLE || "all") as ServiceRole;
  const databaseType = (env.DATABASE_TYPE || "sqlite") as DatabaseType;
  const queueBackend = (env.QUEUE_BACKEND || "sqlite") as QueueBackend;

  // Database config
  const dbHost = env.DATABASE_HOST || defaultDbHost;
  const dbPort = int(env.DATABASE_PORT, 5432);
  const dbUser = env.DATABASE_USER || "eclaire";
  const dbPassword = env.DATABASE_PASSWORD || "eclaire";
  const dbName = env.DATABASE_NAME || "eclaire";

  // Build database URL if not provided
  const databaseUrl =
    env.DATABASE_URL ||
    `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

  // Paths
  const dataDir = env.DATA_DIR || `${home}/data`;
  const configDir = env.CONFIG_DIR || `${home}/config`;

  // Security secrets
  // - Production: required, must be provided
  // - Test: use fixed well-known values for reproducibility
  // - Development: auto-generate random values
  const isTest = env.NODE_ENV === "test";
  const secrets = {
    betterAuthSecret: env.BETTER_AUTH_SECRET || "",
    masterEncryptionKey: env.MASTER_ENCRYPTION_KEY || "",
    apiKeyHmacKeyV1: env.API_KEY_HMAC_KEY_V1 || "",
  };
  let secretsAutoGenerated = false;

  if (!isProduction) {
    if (isTest) {
      // Test mode: use fixed well-known secrets for reproducibility
      if (!secrets.betterAuthSecret)
        secrets.betterAuthSecret = TEST_SECRETS.betterAuthSecret;
      if (!secrets.masterEncryptionKey)
        secrets.masterEncryptionKey = TEST_SECRETS.masterEncryptionKey;
      if (!secrets.apiKeyHmacKeyV1)
        secrets.apiKeyHmacKeyV1 = TEST_SECRETS.apiKeyHmacKeyV1;
    } else {
      // Development mode: auto-generate random secrets
      if (!secrets.betterAuthSecret) {
        secrets.betterAuthSecret = generateHex(32);
        secretsAutoGenerated = true;
      }
      if (!secrets.masterEncryptionKey) {
        secrets.masterEncryptionKey = generateHex(32);
        secretsAutoGenerated = true;
      }
      if (!secrets.apiKeyHmacKeyV1) {
        secrets.apiKeyHmacKeyV1 = generateHex(32);
        secretsAutoGenerated = true;
      }

      // Persist auto-generated secrets to .env.local so they survive restarts
      if (secretsAutoGenerated) {
        persistSecretsToEnvLocal(secrets, home);
      }
    }
  }

  // Determine where secrets came from
  let secretsSource: SecretsSource;
  if (secretsAutoGenerated) {
    secretsSource = "auto-generated";
  } else if (envLoadInfo.isContainer) {
    secretsSource = "environment";
  } else if (envLoadInfo.envLocalLoaded) {
    secretsSource = "env-local";
  } else {
    secretsSource = "env";
  }

  // Build config object
  const config: EclaireConfig = {
    // Runtime
    runtime,
    home,
    nodeEnv: env.NODE_ENV || "development",
    isProduction,
    isContainer,

    // Server
    port: int(env.PORT, isContainer ? 3000 : 3001),
    host: env.HOST || "0.0.0.0",
    logLevel: env.LOG_LEVEL || (isProduction ? "info" : "debug"),

    // Service
    serviceRole,
    databaseType,
    queueBackend,

    // Database
    database: {
      type: databaseType,
      host: dbHost,
      port: dbPort,
      user: dbUser,
      password: dbPassword,
      name: dbName,
      url: databaseUrl,
      sqlitePath: env.SQLITE_DATA_DIR ? `${env.SQLITE_DATA_DIR}/sqlite.db` : `${dataDir}/sqlite/sqlite.db`,
      pgliteDir: env.PGLITE_DATA_DIR || `${dataDir}/pglite`,
    },

    // Queue
    queue: {
      backend: queueBackend,
      redisUrl:
        env.REDIS_URL || `redis://${env.REDIS_HOST || defaultRedisHost}:${int(env.REDIS_PORT, 6379)}`,
      redisKeyPrefix: env.REDIS_KEY_PREFIX || "eclaire",
    },

    // Directories
    dirs: {
      data: dataDir,
      config: configDir,
      users: env.USERS_DIR || `${dataDir}/users`,
      logs: env.LOGS_DIR || `${dataDir}/logs`,
      browserData: env.BROWSER_DATA_DIR || `${dataDir}/browser-data`,
      frontendDist: env.FRONTEND_DIST_PATH || null,
    },

    // Storage
    storage: {
      backend: (env.STORAGE_BACKEND || "local") as "local" | "s3",
    },

    // AI (provider URLs now in config/ai/providers.json)
    ai: {
      debugLogPath: env.AI_DEBUG_LOG_PATH || undefined,
      timeout: int(env.AI_TIMEOUT, 180000),
    },

    // Worker
    worker: {
      port: int(env.WORKER_PORT, 3002),
      concurrency: int(env.WORKER_CONCURRENCY, isProduction ? 5 : 3),
      sharedDataPath:
        env.WORKER_SHARED_DATA_PATH || `${dataDir}/users`,
    },

    // Services
    services: {
      doclingUrl: env.DOCLING_SERVER_URL || defaultDoclingUrl,
      frontendUrl: env.FRONTEND_URL || "http://localhost:3000",
      backendUrl: env.BACKEND_URL || env.API_BASE_URL || defaultBackendUrl,
    },

    // Security
    security: {
      betterAuthSecret: secrets.betterAuthSecret,
      masterEncryptionKey: secrets.masterEncryptionKey,
      apiKeyHmacVersion: env.API_KEY_HMAC_VERSION || "1",
      apiKeyHmacKeyV1: secrets.apiKeyHmacKeyV1,
      secretsSource,
    },

    // Timeouts
    timeouts: {
      browserContext: int(env.BROWSER_CONTEXT_TIMEOUT, 30000),
      pageNavigation: int(env.PAGE_NAVIGATION_TIMEOUT, 65000),
      screenshotDesktop: int(env.SCREENSHOT_DESKTOP_TIMEOUT, 35000),
      screenshotFullpage: int(env.SCREENSHOT_FULLPAGE_TIMEOUT, 50000),
      screenshotMobile: int(env.SCREENSHOT_MOBILE_TIMEOUT, 35000),
      pdfGeneration: int(env.PDF_GENERATION_TIMEOUT, 90000),
    },
  };

  return config;
}

/**
 * Validate the configuration
 * - In development: permissive, auto-generated secrets are allowed
 * - In production: strict, all secrets must be present and strong
 */
export function validateConfig(config: EclaireConfig): string[] {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate SERVICE_ROLE
  if (!["api", "worker", "all"].includes(config.serviceRole)) {
    errors.push(
      `SERVICE_ROLE must be one of: api, worker, all. Got: ${config.serviceRole}`,
    );
  }

  // Validate QUEUE_BACKEND
  if (!["sqlite", "postgres", "redis"].includes(config.queueBackend)) {
    errors.push(
      `QUEUE_BACKEND must be one of: sqlite, postgres, redis. Got: ${config.queueBackend}`,
    );
  }

  // Validate DATABASE_TYPE
  if (!["sqlite", "pglite", "postgresql"].includes(config.databaseType)) {
    errors.push(
      `DATABASE_TYPE must be one of: sqlite, pglite, postgresql. Got: ${config.databaseType}`,
    );
  }

  // SQLite queue only works with SERVICE_ROLE=all
  if (config.queueBackend === "sqlite" && config.serviceRole !== "all") {
    errors.push(
      `QUEUE_BACKEND=sqlite requires SERVICE_ROLE=all (SQLite cannot support remote workers)`,
    );
  }

  // Redis URL required when using redis backend
  if (
    config.queueBackend === "redis" &&
    !config.queue.redisUrl.includes("redis://")
  ) {
    errors.push(`REDIS_URL is required when QUEUE_BACKEND=redis`);
  }

  // Validate HMAC version - only v1 is currently supported
  if (config.security.apiKeyHmacVersion !== "1") {
    errors.push(
      `API_KEY_HMAC_VERSION must be "1" (only v1 is currently supported). Got: "${config.security.apiKeyHmacVersion}"`,
    );
  }

  // Required secrets
  const requiredSecrets = [
    { key: "BETTER_AUTH_SECRET", value: config.security.betterAuthSecret, minLen: 32 },
    { key: "MASTER_ENCRYPTION_KEY", value: config.security.masterEncryptionKey, exactLen: 64, hex: true },
    { key: "API_KEY_HMAC_KEY_V1", value: config.security.apiKeyHmacKeyV1, minLen: 32 },
  ];


  if (config.isProduction) {
    // Production: strict validation
    for (const secret of requiredSecrets) {
      if (!secret.value) {
        errors.push(`Missing required secret: ${secret.key}`);
        continue;
      }

      // Validate length/format
      if (secret.exactLen && secret.value.length !== secret.exactLen) {
        errors.push(`${secret.key} must be exactly ${secret.exactLen} characters`);
      } else if (secret.minLen && secret.value.length < secret.minLen) {
        errors.push(`${secret.key} must be at least ${secret.minLen} characters`);
      }

      // Validate hex format if required
      if (secret.hex && !/^[0-9a-fA-F]+$/.test(secret.value)) {
        errors.push(`${secret.key} must be a valid hex string`);
      }
    }
  } else if (config.nodeEnv === "test") {
    // Test mode: no warnings, fixed secrets are expected for reproducibility
  } else {
    // Development: permissive, secrets source is logged in initConfig()
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n  - ${errors.join("\n  - ")}`);
  }

  return warnings;
}

/**
 * Get a summary of the config for logging (secrets redacted)
 */
export function getConfigSummary(config: EclaireConfig): Record<string, unknown> {
  return {
    runtime: config.runtime,
    home: config.home,
    nodeEnv: config.nodeEnv,
    port: config.port,
    serviceRole: config.serviceRole,
    databaseType: config.databaseType,
    queueBackend: config.queueBackend,
    dataDir: config.dirs.data,
    configDir: config.dirs.config,
    aiConfigDir: `${config.dirs.config}/ai`,
    doclingUrl: config.services.doclingUrl,
    frontendUrl: config.services.frontendUrl,
    secrets: "[REDACTED]",
  };
}
