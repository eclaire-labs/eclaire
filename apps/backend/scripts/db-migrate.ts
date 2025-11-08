// Load environment variables before anything else
import "../src/lib/env-loader";

import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { getDatabaseUrl, getDatabaseType, getPGlitePath, getSqlitePath } from "../src/db/config";
import * as pgSchema from "../src/db/schema/postgres";
import * as sqliteSchema from "../src/db/schema/sqlite";

async function main() {
  const args = process.argv.slice(2);
  const forceFlag = args.includes("--force");
  const statusFlag = args.includes("--status");

  const dbType = getDatabaseType();

  if (dbType === "sqlite") {
    // SQLite migration path
    const sqlitePath = getSqlitePath();
    console.log(`🔍 Connecting to SQLite database: ${sqlitePath}`);

    // Ensure the database directory exists
    const dbDir = path.dirname(sqlitePath);
    if (!fs.existsSync(dbDir)) {
      console.log(`📁 Creating database directory: ${dbDir}`);
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const client = new Database(sqlitePath);

    // Configure SQLite for better concurrency
    client.pragma("journal_mode = WAL");
    client.pragma("synchronous = NORMAL");
    client.pragma("busy_timeout = 5000");
    client.pragma("foreign_keys = ON");

    const db = drizzleSqlite(client, { schema: sqliteSchema });

    try {
      if (statusFlag) {
        console.log("📊 Checking migration status...");
        try {
          const result = client.prepare("SELECT count(*) as count FROM users").get() as { count: number };
          console.log("✅ Database appears to be migrated (users table exists)");
          console.log(`   Users count: ${result.count}`);
        } catch (error) {
          console.log(
            "❌ Database appears to need migration (users table missing)",
          );
          if (error instanceof Error) {
            console.log(`   Error: ${error.message}`);
          }
        }
      } else {
        console.log("🚀 Running database migrations on SQLite...");

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

        await migrateSqlite(db, { migrationsFolder: "./src/db/migrations-sqlite" });
        console.log("✅ Database migrations completed successfully!");
      }
    } catch (error) {
      console.error("❌ Migration failed:", error);
      process.exit(1);
    } finally {
      console.log("🔌 Closing database connection");
      client.close();
    }
  } else if (dbType === "pglite") {
    // PGlite migration path
    const pglitePath = getPGlitePath();
    console.log(`🔍 Connecting to PGlite database: ${pglitePath}`);

    const client = new PGlite(pglitePath);
    const db = drizzlePglite(client, { schema: pgSchema });

    try {
      if (statusFlag) {
        console.log("📊 Checking migration status...");
        try {
          const result = await db.select().from(pgSchema.users).limit(0);
          console.log("✅ Database appears to be migrated (users table exists)");
        } catch (error) {
          console.log(
            "❌ Database appears to need migration (users table missing)",
          );
          if (error instanceof Error) {
            console.log(`   Error: ${error.message}`);
          }
        }
      } else {
        console.log("🚀 Running database migrations on PGlite...");

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

        await migratePglite(db, { migrationsFolder: "./src/db/migrations-postgres" });
        console.log("✅ Database migrations completed successfully!");
      }
    } catch (error) {
      console.error("❌ Migration failed:", error);
      process.exit(1);
    } finally {
      console.log("🔌 Closing database connection");
      await client.close();
    }
  } else {
    // PostgreSQL migration path
    const dbUrl = process.env.DATABASE_URL || getDatabaseUrl();
    console.log(`🔍 Connecting to PostgreSQL database: ${dbUrl}`);

    const client = postgres(dbUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {}, // Suppress NOTICE messages
    });

    const db = drizzlePostgres(client, { schema: pgSchema });

    try {
      if (statusFlag) {
        console.log("📊 Checking migration status...");
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
        console.log("🚀 Running database migrations on PostgreSQL...");

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

        await migratePostgres(db, { migrationsFolder: "./src/db/migrations-postgres" });
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
}

main();
