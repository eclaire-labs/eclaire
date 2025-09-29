import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Load environment variables from .env.dev in development
if (process.env.NODE_ENV === "development") {
  config({ path: ".env.dev" });
}

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://eclaire:eclaire@localhost:5432/eclaire",
  },
  verbose: true,
  strict: true,
} satisfies Config;
