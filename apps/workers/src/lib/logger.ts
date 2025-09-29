import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

const base = {
  service: "eclaire-workers",
  version: process.env.APP_VERSION || process.env.npm_package_version || "0.1.0",
  environment: process.env.NODE_ENV || "development",
};

// Simplified logger configuration for workers - stdout only
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "debug",
    formatters: {
      level: (label: string) => ({ level: label }),
      log: (object: Record<string, any>) => ({
        ...object,
        ...base,
      }),
    },
  },
  isProd
    ? // Production: JSON output to stdout for Docker
      process.stdout
    : // Development: Pretty console output for log-wrapper.sh
      pino.transport({
        target: "pino-pretty",
        options: {
          destination: 1, // stdout
          colorize: true,
          translateTime: "SYS:standard",
          messageFormat: "[{worker}] {msg}",
          ignore: "pid,hostname,service,version,environment",
        },
      }),
);

// Export a child logger creator for use in other modules
export const createChildLogger = (name: string) => {
  return logger.child({ worker: name });
};

// Export the base logger as default
export default logger;
