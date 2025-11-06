import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { createChildLogger } from "../lib/logger";
import { getDatabaseUrl, getDatabaseType, getPGlitePath } from "./config";
import * as schema from "./schema";

const logger = createChildLogger("db");

// Singleton instance
let dbInstance: ReturnType<typeof drizzlePostgres> | ReturnType<typeof drizzlePglite> | null = null;

/**
 * Initialize the database client based on DATABASE_TYPE
 */
function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbType = getDatabaseType();

  if (dbType === "pglite") {
    // Initialize PGlite (file-based, single connection)
    const pglitePath = getPGlitePath();
    logger.info({ path: pglitePath }, "Initializing PGlite database");

    const client = new PGlite(pglitePath);
    dbInstance = drizzlePglite(client, { schema });

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

  return dbInstance;
}

// Export db with lazy initialization
// Using a getter to maintain backward compatibility with `import { db } from "@/db"`
export const db = new Proxy({} as ReturnType<typeof initializeDatabase>, {
  get(target, prop) {
    const instance = initializeDatabase();
    return (instance as any)[prop];
  },
});

// Export the schema for migrations and other uses
export { schema };
