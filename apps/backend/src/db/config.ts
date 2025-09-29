/**
 * Database configuration helper
 * This file helps determine the correct database URL based on environment
 */

// Check if we're running in development mode
export const isDev = process.env.NODE_ENV === "development";

/**
 * Get the appropriate database URL based on the current environment
 *
 * @returns The database URL to use
 */
export function getDatabaseUrl(): string {
  // First priority: Explicitly set DATABASE_URL environment variable
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // Default PostgreSQL connection for development
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const database = process.env.DB_NAME || "eclaire";
  const username = process.env.DB_USER || "eclaire";
  const password = process.env.DB_PASSWORD || "eclaire";

  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
}

/**
 * Get database auth token if available (not needed for PostgreSQL)
 *
 * @returns The auth token or undefined
 */
export function getDatabaseAuthToken(): string | undefined {
  return process.env.DATABASE_AUTH_TOKEN;
}
