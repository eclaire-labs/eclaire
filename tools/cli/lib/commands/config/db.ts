import ora from "ora";
import { getDatabaseType } from "@eclaire/db";
import { createInfoTable } from "../../ui/tables.js";
import { colors, icons } from "../../ui/colors.js";
import { getDb, closeDb } from "../../db/index.js";

export async function dbCommand(): Promise<void> {
  // Load .env first
  await import("@eclaire/core/env-loader");

  const dbType = getDatabaseType();

  console.log(colors.header(`\n  ${icons.gear} Database Status\n`));

  const spinner = ora("Connecting to database...").start();

  try {
    const { dbType: resolvedType, capabilities } = getDb();

    spinner.succeed("Connected to database");

    const data: Record<string, string> = {
      Type: resolvedType,
      "JSON Indexing": capabilities.jsonIndexing ? "Yes" : "No",
      "LISTEN/NOTIFY": capabilities.notify ? "Yes" : "No",
      "SKIP LOCKED": capabilities.skipLocked ? "Yes" : "No",
    };

    if (dbType === "sqlite") {
      const sqlitePath = process.env.SQLITE_DATA_DIR || "data/sqlite";
      data.Path = sqlitePath;
    } else if (dbType === "pglite") {
      const pglitePath = process.env.PGLITE_DATA_DIR || "data/pglite";
      data.Path = pglitePath;
    } else {
      const host = process.env.DATABASE_HOST || "localhost";
      const port = process.env.DATABASE_PORT || "5432";
      const name = process.env.DATABASE_NAME || "eclaire";
      data.Host = `${host}:${port}`;
      data.Database = name;
    }

    console.log(createInfoTable(data));
    console.log();

    await closeDb();
  } catch (error) {
    spinner.fail("Failed to connect to database");
    console.error(
      colors.error(
        `\n  ${icons.error} ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
