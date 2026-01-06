/**
 * Configuration Module
 *
 * Loads environment variables, builds config, and validates.
 * Import this module to get the typed config object.
 *
 * Usage:
 *   import { config } from './config/index.js';
 *   console.log(config.database.type);
 */

import {
  buildConfig,
  validateConfig,
  getConfigSummary,
  type EclaireConfig,
  type EclaireRuntime,
  type DatabaseType,
  type QueueBackend,
  type ServiceRole,
  type SecretsSource,
} from "./schema.js";

// Build the configuration from environment
const _config = buildConfig();

// Export the config object
export const config: EclaireConfig = _config;

// Re-export types
export type {
  EclaireConfig,
  EclaireRuntime,
  DatabaseType,
  QueueBackend,
  ServiceRole,
  SecretsSource,
};

// Re-export utilities
export { validateConfig, getConfigSummary, buildConfig };

/**
 * Validate the configuration.
 * Call this at application startup after env-loader has run.
 * Returns the config and logs any warnings.
 */
export function initConfig(): EclaireConfig {
  const warnings = validateConfig(_config);

  // Log where secrets came from
  const sourceMessages: Record<SecretsSource, string> = {
    env: "loaded from .env",
    environment: "loaded from environment",
  };
  console.log(
    `ℹ️  Secrets: ${sourceMessages[_config.security.secretsSource]}`,
  );

  // Log warnings
  if (warnings.length > 0) {
    console.log("\n⚠️  Configuration Warnings:");
    for (const warning of warnings) {
      console.log(`   - ${warning}`);
    }
    console.log("");
  }

  return _config;
}

/**
 * Print config summary to console (for debugging)
 */
export function printConfigSummary(): void {
  const summary = getConfigSummary(_config);
  console.log("\nEclaire Configuration");
  console.log("=====================");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}: ${value}`);
  }
  console.log("");
}
