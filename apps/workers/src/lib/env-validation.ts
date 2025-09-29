import { createChildLogger } from "./logger";

const logger = createChildLogger("env-validation");

export function validateRequiredEnvVars() {
  const allowDevKeys = process.env.ALLOW_DEV_KEYS === "true";

  // Check for required environment variables
  const required = ["WORKER_API_KEY", "AI_ASSISTANT_API_KEY"];
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

  // If not allowing dev keys, check for insecure development patterns
  if (!allowDevKeys) {
    const insecureVars: string[] = [];

    for (const key of required) {
      const value = process.env[key];
      if (!value) continue; // Already checked above

      const normalizedValue = value.toLowerCase();

      // Check for known dev patterns
      if (normalizedValue.includes("devonly") ||
          normalizedValue.includes("123456789abcdef")) {
        insecureVars.push(key);
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
  }

  // Check for other recommended environment variables
  const recommended = ["REDIS_URL", "BACKEND_URL"];
  const missingRecommended = recommended.filter((key) => !process.env[key]);

  if (missingRecommended.length > 0) {
    logger.warn(
      { missingRecommendedVars: missingRecommended },
      `Recommended environment variables not set: ${missingRecommended.join(", ")} - using defaults`,
    );
  }

  logger.info(
    {
      validatedVars: required,
      environment: process.env.NODE_ENV,
      allowDevKeys,
    },
    "Environment validation complete",
  );
}