import { createChildLogger } from "./logger.js";

const logger = createChildLogger("env-validation");

export type QueueBackend = "redis" | "postgres" | "sqlite";
export type ServiceRole = "api" | "worker" | "all";

/**
 * Get the queue backend from QUEUE_BACKEND env var
 */
export function getQueueBackend(): QueueBackend {
  const queueBackend = process.env.QUEUE_BACKEND;
  if (!queueBackend || !["redis", "postgres", "sqlite"].includes(queueBackend)) {
    throw new Error(
      `QUEUE_BACKEND must be set to one of: redis, postgres, sqlite. Got: ${queueBackend ?? "(not set)"}`,
    );
  }
  return queueBackend as QueueBackend;
}

/**
 * Get the current service role from SERVICE_ROLE env var
 */
export function getServiceRole(): ServiceRole {
  const serviceRole = process.env.SERVICE_ROLE;
  if (!serviceRole || !["api", "worker", "all"].includes(serviceRole)) {
    throw new Error(
      `SERVICE_ROLE must be set to one of: api, worker, all. Got: ${serviceRole ?? "(not set)"}`,
    );
  }
  return serviceRole as ServiceRole;
}

export function validateRequiredEnvVars() {
  const allowDevKeys = process.env.ALLOW_DEV_KEYS === "true";

  // Validate SERVICE_ROLE
  const serviceRole = process.env.SERVICE_ROLE;
  const validRoles: ServiceRole[] = ["api", "worker", "all"];
  if (!serviceRole || !validRoles.includes(serviceRole as ServiceRole)) {
    logger.error(
      { serviceRole, validRoles },
      `SERVICE_ROLE must be set to one of: ${validRoles.join(", ")}. Got: ${serviceRole ?? "(not set)"}`,
    );
    throw new Error(
      `SERVICE_ROLE must be set to one of: ${validRoles.join(", ")}. Got: ${serviceRole ?? "(not set)"}`,
    );
  }

  // Validate QUEUE_BACKEND
  const queueBackend = process.env.QUEUE_BACKEND;
  const validBackends: QueueBackend[] = ["redis", "postgres", "sqlite"];
  if (!queueBackend || !validBackends.includes(queueBackend as QueueBackend)) {
    logger.error(
      { queueBackend, validBackends },
      `QUEUE_BACKEND must be set to one of: ${validBackends.join(", ")}. Got: ${queueBackend ?? "(not set)"}`,
    );
    throw new Error(
      `QUEUE_BACKEND must be set to one of: ${validBackends.join(", ")}. Got: ${queueBackend ?? "(not set)"}`,
    );
  }

  // Validate: sqlite only works with SERVICE_ROLE=all (single process, no remote workers)
  if (queueBackend === "sqlite" && serviceRole !== "all") {
    logger.error(
      { serviceRole, queueBackend },
      `QUEUE_BACKEND=sqlite requires SERVICE_ROLE=all (SQLite cannot support remote workers)`,
    );
    throw new Error(
      `QUEUE_BACKEND=sqlite requires SERVICE_ROLE=all (SQLite cannot support remote workers)`,
    );
  }

  // Validate REDIS_URL when using redis backend
  if (queueBackend === "redis" && !process.env.REDIS_URL) {
    logger.error(
      { serviceRole, queueBackend },
      `REDIS_URL is required when QUEUE_BACKEND=redis`,
    );
    throw new Error(`REDIS_URL is required when QUEUE_BACKEND=redis`);
  }

  // Validate presence of all required variables
  const commonRequired = [
    "BETTER_AUTH_SECRET",
    "MASTER_ENCRYPTION_KEY",
    "API_KEY_HMAC_KEY_V1",
  ];

  // Add worker-specific keys when running as worker or all (which includes workers)
  const workerRequired =
    serviceRole === "worker" || serviceRole === "all"
      ? ["WORKER_API_KEY", "AI_ASSISTANT_API_KEY"]
      : [];

  const required = [...commonRequired, ...workerRequired];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error(
      { missingVars: missing },
      `Missing required environment variables: ${missing.join(", ")}`,
    );
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  // If not allowing dev keys, check for insecure development patterns and validate key lengths
  if (!allowDevKeys) {
    const insecureVars: string[] = [];
    const invalidLengthVars: string[] = [];

    for (const key of required) {
      const value = process.env[key];
      if (!value) continue; // Already checked above

      const normalizedValue = value.toLowerCase();

      // Check for known dev patterns
      if (
        normalizedValue.includes("devonly") ||
        normalizedValue.includes("123456789abcdef")
      ) {
        insecureVars.push(key);
      }

      // Validate key lengths and formats
      switch (key) {
        case "MASTER_ENCRYPTION_KEY":
          // Must be exactly 64 hex characters (32 bytes for AES-256)
          if (value.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(value)) {
            invalidLengthVars.push(
              `${key} (must be exactly 64 hex characters)`,
            );
          }
          break;
        case "BETTER_AUTH_SECRET":
          // Must be at least 32 characters for secure JWT signing
          if (value.length < 32) {
            invalidLengthVars.push(`${key} (must be at least 32 characters)`);
          }
          break;
        case "API_KEY_HMAC_KEY_V1":
          // Must be at least 32 characters for secure HMAC SHA-256
          if (value.length < 32) {
            invalidLengthVars.push(`${key} (must be at least 32 characters)`);
          }
          break;
        case "WORKER_API_KEY":
          // Must be at least 32 characters for secure authentication
          if (value.length < 32) {
            invalidLengthVars.push(`${key} (must be at least 32 characters)`);
          }
          break;
        case "AI_ASSISTANT_API_KEY":
          // Must be at least 32 characters for secure API authentication
          if (value.length < 32) {
            invalidLengthVars.push(`${key} (must be at least 32 characters)`);
          }
          break;
      }
    }

    if (insecureVars.length > 0) {
      logger.error(
        { insecureVars, environment: process.env.NODE_ENV },
        `Development-only keys detected: ${insecureVars.join(", ")}. Set ALLOW_DEV_KEYS=true to allow in development.`,
      );
      throw new Error(
        `Development-only keys detected: ${insecureVars.join(", ")}. Set ALLOW_DEV_KEYS=true to allow in development.`,
      );
    }

    if (invalidLengthVars.length > 0) {
      logger.error(
        { invalidLengthVars, environment: process.env.NODE_ENV },
        `Keys with invalid length or format: ${invalidLengthVars.join(", ")}. Set ALLOW_DEV_KEYS=true to allow in development.`,
      );
      throw new Error(
        `Keys with invalid length or format: ${invalidLengthVars.join(", ")}. Set ALLOW_DEV_KEYS=true to allow in development.`,
      );
    }
  }

  logger.info(
    {
      validatedVars: required,
      environment: process.env.NODE_ENV,
      allowDevKeys,
      serviceRole,
      queueBackend,
    },
    "Environment validation complete",
  );
}
