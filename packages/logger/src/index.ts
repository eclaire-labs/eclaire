import pino, { type Logger, type LoggerOptions } from "pino";
import { getRequestId } from "./context.js";

export type { Logger } from "pino";

// Re-export context utilities for consumers
export {
  asyncLocalStorage,
  getContext,
  getRequestId,
  type RequestContext,
  runWithContext,
  runWithRequestId,
} from "./context.js";

export type LogLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace"
  | "silent";

export interface LoggerConfig {
  /** Service name for log identification */
  service: string;
  /** Log level (default: "debug") */
  level?: LogLevel;
  /** App version for log metadata */
  version?: string;
  /** Environment name (default: "development") */
  environment?: string;
  /** Enable pretty printing for development (default: false in production) */
  pretty?: boolean;
  /** Custom message format for pretty printing */
  messageFormat?: string;
  /** Fields to ignore in pretty output */
  ignoreFields?: string[];
  /** Key used for child logger context (default: "module") */
  contextKey?: string;
}

/**
 * Creates a configured Pino logger instance
 */
export function createLogger(config: LoggerConfig): Logger {
  const {
    service,
    level = "debug",
    version,
    environment = "development",
    pretty = environment !== "production",
    messageFormat = "[{module}] {msg}",
    ignoreFields = ["pid", "hostname", "service", "version", "environment"],
  } = config;

  const base = {
    service,
    ...(version && { version }),
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
          ignore: ignoreFields.join(","),
        },
      }),
    );
  }

  // Production: JSON output to stdout
  return pino(options, process.stdout);
}

/**
 * Creates a child logger with an additional context field
 */
function createChildLogger(
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
  const contextKey = config.contextKey ?? "module";

  return {
    logger: rootLogger,
    createChildLogger: (name: string) =>
      createChildLogger(rootLogger, name, contextKey),
  };
}
