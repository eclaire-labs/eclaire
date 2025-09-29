import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createChildLogger } from "../lib/logger";
import { getDatabaseUrl } from "./config";
import * as schema from "./schema";

const logger = createChildLogger("db");

// Get the database URL based on environment
const dbUrl = getDatabaseUrl();

// Initialize the PostgreSQL client
const client = postgres(dbUrl, {
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Seconds before idle connection is closed
  connect_timeout: 10, // Seconds before connection timeout
  connection: {
    client_encoding: "UTF8",
  },
});

// Initialize the Drizzle ORM instance with our schema
export const db = drizzle(client, { schema });

logger.info(
  { dbUrl: dbUrl.includes("localhost") ? "local" : "remote" },
  "PostgreSQL database connection initialized",
);

// Export the schema for migrations and other uses
export { schema };
