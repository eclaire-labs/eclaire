// Load environment variables before anything else
import "../src/lib/env-loader";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { getDatabaseUrl } from "../src/db/config";
import * as schema from "../src/db/schema";

async function main() {
  const args = process.argv.slice(2);
  const forceFlag = args.includes("--force");
  const statusFlag = args.includes("--status");

  const dbUrl = process.env.DATABASE_URL || getDatabaseUrl();
  console.log(`🔍 Connecting to database: ${dbUrl}`);

  const client = postgres(dbUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {}, // Suppress NOTICE messages
  });

  const db = drizzle(client, { schema });

  try {
    if (statusFlag) {
      console.log("📊 Checking migration status...");
      // Check if migrations have been applied by looking for a user table
      try {
        const result = await client`SELECT count(*) FROM users`;
        console.log("✅ Database appears to be migrated (users table exists)");
        console.log(`   Users count: ${result[0]?.count ?? "unknown"}`);
      } catch (error) {
        console.log(
          "❌ Database appears to need migration (users table missing)",
        );
        if (error instanceof Error) {
          console.log(`   Error: ${error.message}`);
        } else {
          console.log(`   An unknown error occurred: ${error}`);
        }
      }
    } else {
      console.log("🚀 Running database migrations...");

      if (!forceFlag && process.env.NODE_ENV === "production") {
        console.log("⚠️  Running migrations in PRODUCTION environment.");
        console.log(
          "   This will apply all pending migrations to the database.",
        );
        console.log("   Make sure you have a backup before proceeding.");
        console.log("");
        console.log("❌ Production mode requires --force flag for safety");
        process.exit(1);
      } else if (process.env.NODE_ENV !== "production") {
        console.log("ℹ️  Running migrations in development mode...");
      }

      await migrate(db, { migrationsFolder: "./src/db/migrations" });
      console.log("✅ Database migrations completed successfully!");
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    console.log("🔌 Closing database connection");
    await client.end();
  }
}

main();
