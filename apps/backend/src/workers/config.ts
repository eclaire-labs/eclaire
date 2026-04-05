import { config as appConfig } from "../config/index.js";
import { QueueNames } from "../lib/queue/index.js";

// Worker-specific config that wraps the central config and adds worker-only properties
export const config = {
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
  // Queue names
  queues: {
    bookmarkProcessing: QueueNames.BOOKMARK_PROCESSING,
    imageProcessing: QueueNames.IMAGE_PROCESSING,
    documentProcessing: QueueNames.DOCUMENT_PROCESSING,
    noteProcessing: QueueNames.NOTE_PROCESSING,
    taskProcessing: QueueNames.TASK_PROCESSING,
    taskOccurrence: QueueNames.TASK_OCCURRENCE,
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
        handler: "twitter",
      },
      "x.com": {
        delaySeconds: 10,
        maxConcurrent: 1,
        handler: "twitter",
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
