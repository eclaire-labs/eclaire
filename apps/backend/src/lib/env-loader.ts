// Load environment-specific file BEFORE any other imports that need environment variables
import dotenv from "dotenv";
import path from "path";

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

let envFile: string;
if (isProd) {
  envFile = ".env.prod";
} else if (isDev) {
  envFile = ".env.dev";
} else {
  envFile = ".env.dev"; // fallback to dev
}

dotenv.config({
  path: path.resolve(process.cwd(), envFile),
  override: true, // Ensure values from the env file override pre-existing vars like PORT set by Procfile runners
});

// Export a flag to ensure this module was loaded
export const ENV_LOADED = true;
