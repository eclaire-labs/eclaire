import { createChildLogger } from "./logger";

const logger = createChildLogger("env-validation");

/**
 * Get the current queue mode based on SERVICE_ROLE
 * - unified → database mode (no Redis dependency)
 * - backend/worker → redis mode (requires Redis)
 */
export function getQueueMode(): "redis" | "database" {
  const serviceRole = process.env.SERVICE_ROLE || "backend";
  return serviceRole === "unified" ? "database" : "redis";
}

/**
 * Get the current service role
 */
export function getServiceRole(): "backend" | "worker" | "unified" {
  return (process.env.SERVICE_ROLE || "backend") as "backend" | "worker" | "unified";
}

export function validateRequiredEnvVars() {
  const allowDevKeys = process.env.ALLOW_DEV_KEYS === "true";

  // Validate SERVICE_ROLE
  const serviceRole = process.env.SERVICE_ROLE || "backend";
  const validRoles = ["backend", "worker", "unified"];
  if (!validRoles.includes(serviceRole)) {
    logger.error(
      { serviceRole, validRoles },
      `Invalid SERVICE_ROLE: ${serviceRole}. Must be one of: ${validRoles.join(", ")}`,
    );
    throw new Error(
      `Invalid SERVICE_ROLE: ${serviceRole}. Must be one of: ${validRoles.join(", ")}`,
    );
  }

  // Determine queue mode based on SERVICE_ROLE
  // unified = database mode (no Redis), backend/worker = redis mode (requires Redis)
  const queueMode = serviceRole === "unified" ? "database" : "redis";

  // Validate REDIS_URL when in redis mode
  if (queueMode === "redis" && !process.env.REDIS_URL) {
    logger.error(
      { serviceRole, queueMode },
      `REDIS_URL is required when SERVICE_ROLE is 'backend' or 'worker'`,
    );
    throw new Error(
      `REDIS_URL is required when SERVICE_ROLE is 'backend' or 'worker'`,
    );
  }

  // Validate presence of all required variables
  const commonRequired = [
    "BETTER_AUTH_SECRET",
    "MASTER_ENCRYPTION_KEY",
    "API_KEY_HMAC_KEY_V1",
  ];

  // Add worker-specific keys when running as worker or unified
  const workerRequired =
    serviceRole === "worker" || serviceRole === "unified"
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
      queueMode,
    },
    "Environment validation complete",
  );
}
