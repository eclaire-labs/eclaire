// lib/logger.ts

import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

const base = {
  service: "eclaire-frontend",
  version: process.env.npm_package_version ?? "0.1.0",
  environment: process.env.NODE_ENV ?? "development",
};

function createLogger() {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
      base,
    },
    isProd
      ? // Production: JSON output to stdout for Docker
        process.stdout
      : // Development: Pretty console output
        pino.transport({
          target: "pino-pretty",
          options: {
            destination: 1, // stdout
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname,service,version,environment",
          },
        }),
  );
}

// Singleton to avoid multiple file handles during Next dev HMR
const globalForLogger = globalThis as unknown as { __logger?: pino.Logger };
export const logger =
  globalForLogger.__logger ?? (globalForLogger.__logger = createLogger());

// Export a child logger creator for use in other modules
export const createChildLogger = (name: string) => {
  return logger.child({ module: name });
};

// Export the base logger as default
export default logger;
