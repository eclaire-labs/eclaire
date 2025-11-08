import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { createChildLogger } from "../lib/logger";
import { getDatabaseUrl, getDatabaseType, getPGlitePath } from "./config";
import * as schema from "./schema";

const logger = createChildLogger("db");

// Singleton instance
// Both drizzlePostgres and drizzlePglite return compatible database instances
// We use the PostgreSQL type as the common type since PGlite implements the same interface
type DbInstance = ReturnType<typeof drizzlePostgres<typeof schema>>;
let dbInstance: DbInstance | null = null;

/**
 * Initialize the database client based on DATABASE_TYPE
 */
function initializeDatabase(): DbInstance {
  if (dbInstance) {
    return dbInstance;
  }

  const dbType = getDatabaseType();

  if (dbType === "pglite") {
    // Initialize PGlite (file-based, single connection)
    const pglitePath = getPGlitePath();
    logger.info({ path: pglitePath }, "Initializing PGlite database");

    const client = new PGlite(pglitePath);
    // PGlite implements the same Drizzle ORM interface as PostgreSQL
    // Use 'as any' to bypass internal type differences while maintaining external API compatibility
    dbInstance = drizzlePglite(client, { schema }) as any;

    logger.info({ path: pglitePath }, "PGlite database initialized");
  } else {
    // Initialize PostgreSQL (with connection pooling)
    const dbUrl = getDatabaseUrl();
    logger.info(
      { dbUrl: dbUrl.includes("localhost") ? "local" : "remote" },
      "Initializing PostgreSQL database connection",
    );

    const client = postgres(dbUrl, {
      max: 10, // Maximum number of connections
      idle_timeout: 20, // Seconds before idle connection is closed
      connect_timeout: 10, // Seconds before connection timeout
      connection: {
        client_encoding: "UTF8",
      },
    });

    dbInstance = drizzlePostgres(client, { schema });

    logger.info(
      { dbUrl: dbUrl.includes("localhost") ? "local" : "remote" },
      "PostgreSQL database connection initialized",
    );
  }

  // dbInstance is always set at this point
  return dbInstance!;
}

// Export db instance directly
// Direct initialization provides better TypeScript type inference
export const db = initializeDatabase();

// Export the schema for migrations and other uses
export { schema };
