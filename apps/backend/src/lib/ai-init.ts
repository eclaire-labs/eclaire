/**
 * AI Client Initialization
 *
 * Initializes the @eclaire/ai package with backend configuration.
 * Call this early in application startup, before using any AI functions.
 */

import { initAI } from "@eclaire/ai";
import * as path from "node:path";
import { config } from "../config/index.js";
import { createChildLogger } from "./logger.js";

/**
 * Initialize the AI client with backend configuration.
 * Must be called before validateAIConfigOnStartup() or any AI calls.
 */
export function initializeAI(): void {
  initAI({
    configPath: path.join(config.dirs.config, "ai"),
    createChildLogger,
    debugLogPath: config.ai.debugLogPath,
  });
}
