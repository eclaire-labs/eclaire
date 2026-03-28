/**
 * Worker initialization module
 * Exports functions to start database workers (in-process or remote)
 */

import fs from "node:fs";
import { isAIInitialized, validateAIConfigOnStartup } from "@eclaire/ai";
import { config as appConfig } from "../config/index.js";
import { initializeAI, initializeMcp } from "../lib/ai-init.js";
import { createChildLogger } from "../lib/logger.js";
import {
  startDirectDbWorkers,
  stopDirectDbWorkers,
} from "./lib/direct-db-workers.js";
import {
  startRemoteDbWorkers,
  stopRemoteDbWorkers,
} from "./lib/remote-db-workers.js";

const logger = createChildLogger("workers");

/**
 * Ensure browser data directory exists and initialize AI
 */
async function prepareWorkerEnvironment(): Promise<void> {
  const browserDataDir = appConfig.dirs.browserData;
  try {
    fs.mkdirSync(browserDataDir, { recursive: true });
    logger.info({ browserDataDir }, "Browser data directory ensured");
  } catch (error) {
    logger.error(
      {
        browserDataDir,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to create browser data directory",
    );
    throw error;
  }

  if (!isAIInitialized()) {
    await initializeAI();
  }
  await initializeMcp();
  validateAIConfigOnStartup();
}

/**
 * Start remote database workers (SERVICE_ROLE=worker)
 * Connects to Postgres remotely with NOTIFY for SSE events
 */
export async function startRemoteWorkers(): Promise<void> {
  logger.info("Starting remote database workers");
  await prepareWorkerEnvironment();
  await startRemoteDbWorkers();
}

/**
 * Start database queue workers (SERVICE_ROLE=all)
 * In-process workers using direct database access
 */
export async function startDatabaseWorkers(): Promise<void> {
  logger.info("Starting database queue workers (in-process)");
  await prepareWorkerEnvironment();
  await startDirectDbWorkers();
}

/**
 * Shutdown all workers gracefully
 */
export async function shutdownWorkers(): Promise<void> {
  logger.info("Shutting down workers...");
  await stopDirectDbWorkers();
  await stopRemoteDbWorkers();
  logger.info("All workers shut down");
}
