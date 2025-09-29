import { createChildLogger } from "./lib/logger";

const logger = createChildLogger("config");

export const config = {
  redis: {
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  },
  backend: {
    url: process.env.BACKEND_URL || "http://backend:3001", // URL of the backend API service - use Docker service name
  },
  // Single API key for all workers
  apiKey: process.env.WORKER_API_KEY,
  worker: {
    // Default concurrency, can be overridden per worker if needed
    concurrency: Number.parseInt(process.env.WORKER_CONCURRENCY || "5", 10),
    aiTimeout: Number.parseInt(process.env.AI_TIMEOUT || "180000", 10), // 2 minutes timeout
  },
  // Timeout configuration for browser operations
  timeouts: {
    browserContext: Number.parseInt(
      process.env.BROWSER_CONTEXT_TIMEOUT || "30000",
      10,
    ), // 30 seconds
    pageNavigation: Number.parseInt(
      process.env.PAGE_NAVIGATION_TIMEOUT || "65000",
      10,
    ), // 65 seconds
    screenshotDesktop: Number.parseInt(
      process.env.SCREENSHOT_DESKTOP_TIMEOUT || "35000",
      10,
    ), // 35 seconds
    screenshotFullpage: Number.parseInt(
      process.env.SCREENSHOT_FULLPAGE_TIMEOUT || "50000",
      10,
    ), // 50 seconds
    screenshotMobile: Number.parseInt(
      process.env.SCREENSHOT_MOBILE_TIMEOUT || "35000",
      10,
    ), // 35 seconds
    pdfGeneration: Number.parseInt(
      process.env.PDF_GENERATION_TIMEOUT || "90000",
      10,
    ), // 90 seconds
  },
  server: {
    port: Number.parseInt(process.env.WORKER_PORT || "4000", 10), // Port for Fastify/Bull Board
    basePath: "/ui", // Base path for Bull Board UI
  },
  queues: {
    bookmarkProcessing: "bookmark-processing",
    imageProcessing: "image-processing",
    documentProcessing: "document-processing",
    noteProcessing: "note-processing",
    taskProcessing: "task-processing",
    taskExecutionProcessing: "task-execution-processing",
  },
  // Domain-specific rate limiting configuration
  domains: {
    // Default rate limit for all domains (same domain requests)
    defaultRateLimit: {
      delaySeconds: 10,
      maxConcurrent: 1,
    },
    // Inter-domain delay (between requests to different domains)
    interDomainDelayMs: 500,
    // Domain-specific overrides
    rules: {
      "twitter.com": {
        delaySeconds: 10,
        maxConcurrent: 1,
        handler: "regular",
      },
      "x.com": {
        delaySeconds: 10,
        maxConcurrent: 1,
        handler: "regular",
      },
      "reddit.com": {
        delaySeconds: 10,
        maxConcurrent: 1,
        handler: "reddit",
      },
    } as Record<
      string,
      {
        delaySeconds?: number;
        maxConcurrent?: number;
        handler?: string;
        [handlerName: string]: any; // Allow handler-specific nested rules
      }
    >,
  },
};

// Note: Environment validation is now handled in env-validation.ts during startup
// This ensures proper security validation beyond just checking if values exist
