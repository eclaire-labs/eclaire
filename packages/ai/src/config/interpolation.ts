/**
 * Environment variable interpolation and dialect endpoint resolution.
 */

import type { Dialect, ProviderAuth } from "../types.js";

/**
 * Default endpoint paths for each dialect.
 * These are appended to the baseUrl if not overridden.
 */
const DIALECT_ENDPOINTS: Record<Dialect, string> = {
  openai_compatible: "/chat/completions",
  mlx_native: "/responses",
  anthropic_messages: "/v1/messages",
  cli_jsonl: "",
};

/**
 * Interpolate environment variables in a string.
 * Supports ${ENV:VAR_NAME} syntax.
 *
 * @param value - String potentially containing ${ENV:VAR} placeholders
 * @param throwOnMissing - If true, throw error when env var is not set (default: true)
 * @returns The string with environment variables replaced
 *
 * @example
 * interpolateEnvVars("Bearer ${ENV:API_KEY}") // "Bearer sk-..."
 * interpolateEnvVars("${ENV:MISSING}", false) // "${ENV:MISSING}" (unchanged)
 */
export function interpolateEnvVars(
  value: string,
  throwOnMissing = true,
): string {
  return value.replace(/\$\{ENV:([^}]+)\}/g, (match, varName) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      if (throwOnMissing) {
        throw new Error(
          `Environment variable ${varName} is not set. ` +
            `Set it in your .env file or environment before starting the server.`,
        );
      }
      return match; // Return unchanged if not throwing
    }
    return envValue;
  });
}

/**
 * Check if a string contains environment variable references
 */
export function hasEnvVarReference(value: string): boolean {
  return /\$\{ENV:[^}]+\}/.test(value);
}

/**
 * Interpolate environment variables in provider auth
 */
export function interpolateAuth(auth: ProviderAuth): ProviderAuth {
  if (auth.type === "none") {
    return auth;
  }

  return {
    ...auth,
    value: auth.value ? interpolateEnvVars(auth.value) : undefined,
  };
}

/**
 * Interpolate environment variables in headers
 */
export function interpolateHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return undefined;

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = interpolateEnvVars(value);
  }
  return result;
}

/**
 * Get the endpoint path for a dialect
 */
export function getDialectEndpoint(
  dialect: Dialect,
  overridePath?: string,
): string {
  return overridePath ?? DIALECT_ENDPOINTS[dialect];
}
