import type { Context, Next } from "hono";
import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

const base = {
  service: "eclaire-backend",
  version:
    process.env.APP_VERSION || process.env.npm_package_version || "0.1.0",
  environment: process.env.NODE_ENV || "development",
};

// Simplified logger configuration - stdout only
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "debug",
    formatters: {
      level: (label) => ({ level: label }),
      log: (object) => ({
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
          messageFormat: "[{requestId}] {method} {path} - {msg}",
          ignore: "pid,hostname,service,version,environment",
        },
      }),
);

/**
 * Checks if the content type represents large/binary content that shouldn't be logged
 */
function isLargeContentType(contentType: string | undefined): boolean {
  if (!contentType) return false;

  const largeContentTypes = [
    "multipart/",
    "image/",
    "video/",
    "audio/",
    "application/octet-stream",
    "application/pdf",
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
  ];

  return largeContentTypes.some((type) => contentType.includes(type));
}

/**
 * Smart Hono middleware that logs requests/responses while protecting against large content
 */
export const smartLogger = () => {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const requestId = crypto.randomUUID().slice(0, 8);

    // Store requestId in context for use in other parts of the app
    c.set("requestId", requestId);

    const contentLength = c.req.header("content-length");
    const contentType = c.req.header("content-type");
    const url = new URL(c.req.url);

    const logData: Record<string, unknown> = {
      requestId,
      method: c.req.method,
      path: url.pathname,
      query: url.search || undefined,
      userAgent: c.req.header("user-agent"),
      contentType,
      contentLength: contentLength ? Number.parseInt(contentLength) : undefined,
      ip:
        c.req.header("x-forwarded-for") ||
        c.req.header("x-real-ip") ||
        "unknown",
    };

    // Smart content logging - avoid logging large/binary content
    if (contentLength && Number.parseInt(contentLength) > 0) {
      const size = Number.parseInt(contentLength);

      if (size <= 1024 && !isLargeContentType(contentType)) {
        logData.bodyInfo = `${size} bytes (${contentType || "text"}) - small content`;
      } else {
        logData.bodyInfo = `${contentLength} bytes (${contentType || "unknown"}) - large/binary content`;
      }
    }

    logger.info(logData, "Request started");

    try {
      await next();

      const duration = Date.now() - start;

      // Get user info if available (after auth middleware has run)
      const user = c.get("user");
      const userId = user?.id;

      logger.info(
        {
          requestId,
          method: c.req.method,
          path: url.pathname,
          query: url.search || undefined,
          status: c.res.status,
          duration: `${duration}ms`,
          userId: userId || undefined,
          responseContentLength:
            c.res.headers.get("content-length") || undefined,
          responseContentType: c.res.headers.get("content-type") || undefined,
        },
        "Request completed",
      );
    } catch (error) {
      const duration = Date.now() - start;

      // Get user info if available (even for failed requests)
      const user = c.get("user");
      const userId = user?.id;

      logger.error(
        {
          requestId,
          method: c.req.method,
          path: url.pathname,
          query: url.search || undefined,
          userId: userId || undefined,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          duration: `${duration}ms`,
        },
        "Request failed",
      );

      throw error;
    }
  };
};

// Export a child logger creator for use in other modules
export const createChildLogger = (name: string) => {
  return logger.child({ module: name });
};

// Export the base logger as default
export default logger;
