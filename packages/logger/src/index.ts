import pino, { type Logger, type LoggerOptions } from "pino";
import { getRequestId } from "./context.js";

export type { Logger } from "pino";

// Re-export context utilities for consumers
export {
  asyncLocalStorage,
  getRequestId,
  type RequestContext,
  runWithRequestId,
} from "./context.js";

export interface LoggerConfig {
  /** Service name for log identification */
  service: string;
  /** Log level (default: "debug") */
  level?: string;
  /** App version for log metadata */
  version?: string;
  /** Environment name (default: "development") */
  environment?: string;
  /** Enable pretty printing for development (default: false in production) */
  pretty?: boolean;
  /** Custom message format for pretty printing */
  messageFormat?: string;
  /** Fields to ignore in pretty output */
  ignoreFields?: string;
}

/**
 * Creates a configured Pino logger instance
 */
export function createLogger(config: LoggerConfig): Logger {
  const {
    service,
    level = "debug",
    version = "0.1.0",
    environment = "development",
    pretty = environment !== "production",
    messageFormat = "[{module}] {msg}",
    ignoreFields = "pid,hostname,service,version,environment",
  } = config;

  const base = {
    service,
    version,
    environment,
  };

  const options: LoggerOptions = {
    level,
    // Mixin automatically adds requestId from AsyncLocalStorage to every log entry
    mixin() {
      const requestId = getRequestId();
      return requestId ? { requestId } : {};
    },
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => ({
        ...object,
        ...base,
      }),
    },
  };

  if (pretty) {
    // Development: Pretty console output
    return pino(
      options,
      pino.transport({
        target: "pino-pretty",
        options: {
          destination: 1, // stdout
          colorize: true,
          translateTime: "SYS:standard",
          messageFormat,
          ignore: ignoreFields,
        },
      }),
    );
  }

  // Production: JSON output to stdout
  return pino(options, process.stdout);
}

/**
 * Creates a child logger with an additional context field
 * @param parent - The parent logger instance
 * @param name - The name/module identifier for this child logger
 * @param contextKey - The key to use for the context (default: "module")
 */
export function createChildLogger(
  parent: Logger,
  name: string,
  contextKey = "module",
): Logger {
  return parent.child({ [contextKey]: name });
}

/**
 * Creates a pre-configured logger factory for a specific service
 * Returns a function that creates child loggers with consistent configuration
 */
export function createLoggerFactory(config: LoggerConfig) {
  const rootLogger = createLogger(config);
  const contextKey = config.messageFormat?.includes("{worker}")
    ? "worker"
    : "module";

  return {
    logger: rootLogger,
    createChildLogger: (name: string) =>
      createChildLogger(rootLogger, name, contextKey),
  };
}
