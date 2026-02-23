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

import { envLoadInfo } from "../lib/env-loader.js";

export type EclaireRuntime = "local" | "container";
export type SecretsSource = "env" | "environment";
export type DatabaseType = "sqlite" | "pglite" | "postgres";
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
    url: string | null; // Full connection string (null for sqlite/pglite)
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
function _required(key: string, value: string | undefined): string {
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
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse a boolean
 */
function _bool(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === "true";
}

/**
 * Generate a random hex string (for auto-generating dev secrets)
 */
function _generateHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Seed for deterministic test secrets.
 * The "DEVONLY" prefix ensures these can never accidentally be used in production.
 */
const DEVONLY_TEST_SEED = "DEVONLY_ECLAIRE_TEST_SECRET_SEED_2024";

/**
 * Generate deterministic test secrets from the DEVONLY seed.
 * These are intentionally weak and predictable for reproducible testing.
 * Production validation will reject any secret containing "DEVONLY".
 */
function deriveTestSecrets(): {
  betterAuthSecret: string;
  masterEncryptionKey: string;
  apiKeyHmacKeyV1: string;
} {
  // Simple deterministic derivation - not cryptographically secure, but reproducible
  const hash = (input: string): string => {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) - h + input.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(16).padStart(8, "0");
  };

  // Generate deterministic hex strings of required lengths
  const authSeed = `${DEVONLY_TEST_SEED}_auth`;
  const encSeed = `${DEVONLY_TEST_SEED}_encryption`;
  const hmacSeed = `${DEVONLY_TEST_SEED}_hmac`;

  return {
    // 32+ chars, contains DEVONLY marker
    betterAuthSecret: `DEVONLY_${hash(authSeed)}${hash(`${authSeed}2`)}${hash(`${authSeed}3`)}`,
    // 64 hex chars exactly
    masterEncryptionKey: `${hash(encSeed)}${hash(`${encSeed}1`)}${hash(`${encSeed}2`)}${hash(`${encSeed}3`)}${hash(`${encSeed}4`)}${hash(`${encSeed}5`)}${hash(`${encSeed}6`)}${hash(`${encSeed}7`)}`,
    // 32+ chars, contains DEVONLY marker
    apiKeyHmacKeyV1: `DEVONLY_${hash(hmacSeed)}${hash(`${hmacSeed}2`)}${hash(`${hmacSeed}3`)}`,
  };
}

const TEST_SECRETS = deriveTestSecrets();

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

  // Set DATABASE_HOST in process.env so @eclaire/db uses correct host
  // This must happen before any code calls getDatabaseUrl()
  env.DATABASE_HOST ??= defaultDbHost;

  // AI provider URL defaults based on runtime
  // In containers, use host.docker.internal to reach host machine
  // Locally, use 127.0.0.1
  const llmHost = isContainer ? "host.docker.internal" : "127.0.0.1";
  env.LLAMA_CPP_BASE_URL ??= `http://${llmHost}:11500/v1`;
  env.LLAMA_CPP_BASE_URL_2 ??= `http://${llmHost}:11501/v1`;
  env.OLLAMA_BASE_URL ??= `http://${llmHost}:11434/v1`;
  env.LM_STUDIO_BASE_URL ??= `http://${llmHost}:1234/v1`;
  env.MLX_LM_BASE_URL ??= `http://${llmHost}:8080/v1`;
  env.MLX_VLM_BASE_URL ??= `http://${llmHost}:8080/v1`;

  // Service configuration
  const serviceRole = (env.SERVICE_ROLE || "all") as ServiceRole;
  // Normalize "postgresql" to "postgres" for backwards compatibility
  // Default to postgres for dev/prod parity (SQLite is opt-in)
  const rawDbType = env.DATABASE_TYPE?.toLowerCase();
  const databaseType = (
    rawDbType === "postgresql" ? "postgres" : rawDbType || "postgres"
  ) as DatabaseType;
  // Queue backend defaults to match database type (postgres with postgres, sqlite with sqlite)
  const defaultQueueBackend = databaseType === "sqlite" ? "sqlite" : "postgres";
  const queueBackend = (env.QUEUE_BACKEND ||
    defaultQueueBackend) as QueueBackend;

  // Database config
  const dbHost = env.DATABASE_HOST || defaultDbHost;
  const dbPort = int(env.DATABASE_PORT, 5432);
  const dbUser = env.DATABASE_USER || "eclaire";
  const dbPassword = env.DATABASE_PASSWORD || "eclaire";
  const dbName = env.DATABASE_NAME || "eclaire";

  // Build database URL if not provided
  // Only build postgres URL for postgres type; sqlite/pglite use file paths instead
  const databaseUrl =
    env.DATABASE_URL ||
    (databaseType === "postgres"
      ? `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`
      : null);

  // Paths
  const dataDir = env.DATA_DIR || `${home}/data`;
  const configDir = env.CONFIG_DIR || `${home}/config`;

  // Security secrets
  // - Production: required, must be provided, DEVONLY values rejected
  // - Test: use deterministic DEVONLY values for reproducibility
  // - Development: required from .env (run pnpm setup:dev to generate)
  const isTest = env.NODE_ENV === "test";
  const secrets = {
    betterAuthSecret: env.BETTER_AUTH_SECRET || "",
    masterEncryptionKey: env.MASTER_ENCRYPTION_KEY || "",
    apiKeyHmacKeyV1: env.API_KEY_HMAC_KEY_V1 || "",
  };

  if (isTest) {
    // Test mode: ALWAYS use deterministic DEVONLY secrets for reproducibility
    // This ensures tests are identical regardless of .env contents, making them
    // reproducible across developer machines and CI environments
    secrets.betterAuthSecret = TEST_SECRETS.betterAuthSecret;
    secrets.masterEncryptionKey = TEST_SECRETS.masterEncryptionKey;
    secrets.apiKeyHmacKeyV1 = TEST_SECRETS.apiKeyHmacKeyV1;
  } else if (!isProduction) {
    // Development mode: secrets must come from .env
    // If missing, fail with helpful error pointing to setup
    const missingSecrets: string[] = [];
    if (!secrets.betterAuthSecret) missingSecrets.push("BETTER_AUTH_SECRET");
    if (!secrets.masterEncryptionKey)
      missingSecrets.push("MASTER_ENCRYPTION_KEY");
    if (!secrets.apiKeyHmacKeyV1) missingSecrets.push("API_KEY_HMAC_KEY_V1");

    if (missingSecrets.length > 0) {
      throw new Error(
        `Missing required secrets: ${missingSecrets.join(", ")}\n\n` +
          `Run 'pnpm setup:dev' to generate secrets and configure your environment.\n` +
          `See README.md for setup instructions.`,
      );
    }
  }
  // Production validation happens in validateConfig()

  // Determine where secrets came from
  let secretsSource: SecretsSource;
  if (isTest) {
    secretsSource = "env"; // Test secrets appear to come from env (deterministic)
  } else if (envLoadInfo.isContainer) {
    secretsSource = "environment";
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
      sqlitePath: env.SQLITE_DATA_DIR
        ? `${env.SQLITE_DATA_DIR}/sqlite.db`
        : `${dataDir}/sqlite/sqlite.db`,
      pgliteDir: env.PGLITE_DATA_DIR || `${dataDir}/pglite`,
    },

    // Queue
    queue: {
      backend: queueBackend,
      redisUrl:
        env.REDIS_URL ||
        `redis://${env.REDIS_HOST || defaultRedisHost}:${int(env.REDIS_PORT, 6379)}`,
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
      sharedDataPath: env.WORKER_SHARED_DATA_PATH || `${dataDir}/users`,
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
  if (!["sqlite", "pglite", "postgres"].includes(config.databaseType)) {
    errors.push(
      `DATABASE_TYPE must be one of: sqlite, pglite, postgres. Got: ${config.databaseType}`,
    );
  }

  // SQLite queue only works with SERVICE_ROLE=all
  if (config.queueBackend === "sqlite" && config.serviceRole !== "all") {
    errors.push(
      `QUEUE_BACKEND=sqlite requires SERVICE_ROLE=all (SQLite cannot support remote workers)`,
    );
  }

  // Database-backed queue must match DATABASE_TYPE
  // Valid combinations:
  // - DATABASE_TYPE=sqlite + QUEUE_BACKEND=sqlite
  // - DATABASE_TYPE=postgres/pglite + QUEUE_BACKEND=postgres
  // - Any DATABASE_TYPE + QUEUE_BACKEND=redis (redis is independent)
  if (config.queueBackend !== "redis") {
    const dbIsPostgresLike =
      config.databaseType === "postgres" || config.databaseType === "pglite";
    const queueIsPostgres = config.queueBackend === "postgres";

    if (dbIsPostgresLike && !queueIsPostgres) {
      errors.push(
        `QUEUE_BACKEND=${config.queueBackend} is incompatible with DATABASE_TYPE=${config.databaseType}. ` +
          `Use QUEUE_BACKEND=postgres or QUEUE_BACKEND=redis`,
      );
    }
    if (config.databaseType === "sqlite" && queueIsPostgres) {
      errors.push(
        `QUEUE_BACKEND=postgres is incompatible with DATABASE_TYPE=sqlite. ` +
          `Use QUEUE_BACKEND=sqlite or QUEUE_BACKEND=redis`,
      );
    }
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
    {
      key: "BETTER_AUTH_SECRET",
      value: config.security.betterAuthSecret,
      minLen: 32,
    },
    {
      key: "MASTER_ENCRYPTION_KEY",
      value: config.security.masterEncryptionKey,
      exactLen: 64,
      hex: true,
    },
    {
      key: "API_KEY_HMAC_KEY_V1",
      value: config.security.apiKeyHmacKeyV1,
      minLen: 32,
    },
  ];

  if (config.isProduction) {
    // Production: strict validation
    for (const secret of requiredSecrets) {
      if (!secret.value) {
        errors.push(`Missing required secret: ${secret.key}`);
        continue;
      }

      // Reject DEVONLY secrets in production (these are test-only values)
      if (secret.value.includes("DEVONLY")) {
        errors.push(
          `${secret.key} contains "DEVONLY" - test secrets are not allowed in production. ` +
            `Generate proper secrets with: openssl rand -hex 32`,
        );
        continue;
      }

      // Reject the specific test master encryption key (it's pure hex without DEVONLY marker)
      if (
        secret.key === "MASTER_ENCRYPTION_KEY" &&
        secret.value === TEST_SECRETS.masterEncryptionKey
      ) {
        errors.push(
          `${secret.key} is using the test value - generate a real secret for production: openssl rand -hex 32`,
        );
        continue;
      }

      // Validate length/format
      if (secret.exactLen && secret.value.length !== secret.exactLen) {
        errors.push(
          `${secret.key} must be exactly ${secret.exactLen} characters`,
        );
      } else if (secret.minLen && secret.value.length < secret.minLen) {
        errors.push(
          `${secret.key} must be at least ${secret.minLen} characters`,
        );
      }

      // Validate hex format if required
      if (secret.hex && !/^[0-9a-fA-F]+$/.test(secret.value)) {
        errors.push(`${secret.key} must be a valid hex string`);
      }
    }
  } else if (config.nodeEnv === "test") {
    // Test mode: no warnings, deterministic DEVONLY secrets are expected
  } else {
    // Development: secrets validated at build time (see buildConfig)
  }

  if (errors.length > 0) {
    throw new Error(
      `Configuration validation failed:\n  - ${errors.join("\n  - ")}`,
    );
  }

  return warnings;
}

/**
 * Get a summary of the config for logging (secrets redacted)
 */
export function getConfigSummary(
  config: EclaireConfig,
): Record<string, unknown> {
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
