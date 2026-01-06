/**
 * AI Logger
 *
 * Internal module for logger creation.
 * Uses the logger factory injected via initAI().
 */

import type { AILogger } from "./types.js";

// Module-level state for logger factory
let _loggerFactory: ((name: string) => AILogger) | null = null;
const _loggerCache: Map<string, AILogger> = new Map();

/**
 * Set the logger factory (called by initAI)
 * @internal
 */
export function setLoggerFactory(factory: (name: string) => AILogger): void {
  _loggerFactory = factory;
  _loggerCache.clear();
}

/**
 * Clear the logger factory and cache (called by resetAI)
 * @internal
 */
export function clearLoggerFactory(): void {
  _loggerFactory = null;
  _loggerCache.clear();
}

/**
 * Console fallback logger for when no factory is configured
 */
const consoleLogger: AILogger = {
  debug: (obj, msg) => console.debug(`[AI] ${msg || ""}`, obj),
  info: (obj, msg) => console.info(`[AI] ${msg || ""}`, obj),
  warn: (obj, msg) => console.warn(`[AI] ${msg || ""}`, obj),
  error: (obj, msg) => console.error(`[AI] ${msg || ""}`, obj),
};

/**
 * Create a child logger for an AI module
 *
 * @param name - Logger name (e.g., "ai-client", "ai-config")
 * @returns Logger instance
 */
export function createAILogger(name: string): AILogger {
  // Check cache first
  const cached = _loggerCache.get(name);
  if (cached) {
    return cached;
  }

  // Use factory if available, otherwise fallback to console
  let logger: AILogger;
  if (_loggerFactory) {
    logger = _loggerFactory(name);
  } else {
    // Use console fallback but prefix with module name
    logger = {
      debug: (obj, msg) => console.debug(`[${name}] ${msg || ""}`, obj),
      info: (obj, msg) => console.info(`[${name}] ${msg || ""}`, obj),
      warn: (obj, msg) => console.warn(`[${name}] ${msg || ""}`, obj),
      error: (obj, msg) => console.error(`[${name}] ${msg || ""}`, obj),
    };
  }

  // Cache and return
  _loggerCache.set(name, logger);
  return logger;
}
