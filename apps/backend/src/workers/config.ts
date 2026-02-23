import { config as appConfig } from "../config/index.js";
import { QueueNames } from "../lib/queue/index.js";

// Worker-specific config that wraps the central config and adds worker-only properties
export const config = {
  // Redis config from central config
  redis: {
    url: appConfig.queue.redisUrl,
    keyPrefix: appConfig.queue.redisKeyPrefix,
  },
  // Backend URL from central config
  backend: {
    url: appConfig.services.backendUrl,
  },
  // Docling URL from central config
  docling: {
    url: appConfig.services.doclingUrl,
  },
  // Worker settings from central config
  worker: {
    concurrency: appConfig.worker.concurrency,
    aiTimeout: appConfig.ai.timeout,
  },
  // Timeouts from central config
  timeouts: appConfig.timeouts,
  // Worker server settings
  server: {
    port: appConfig.worker.port,
    basePath: "/ui", // Base path for Bull Board UI
  },
  // Queue names
  queues: {
    bookmarkProcessing: QueueNames.BOOKMARK_PROCESSING,
    imageProcessing: QueueNames.IMAGE_PROCESSING,
    documentProcessing: QueueNames.DOCUMENT_PROCESSING,
    noteProcessing: QueueNames.NOTE_PROCESSING,
    taskProcessing: QueueNames.TASK_PROCESSING,
    taskExecutionProcessing: QueueNames.TASK_EXECUTION_PROCESSING,
  },
  // Domain-specific rate limiting configuration (worker-specific)
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
        // biome-ignore lint/suspicious/noExplicitAny: allow handler-specific nested config rules
        [handlerName: string]: any;
      }
    >,
  },
};
