// scripts/clear-queues.ts

import { Queue } from "bullmq";
import dotenv from "dotenv";
import { Redis } from "ioredis";
import path from "path";

// Load environment-specific file
const envFile =
  process.env.NODE_ENV === "production" ? ".env.prod" : ".env.dev";

console.log(`Loading environment from: ${envFile}`);
dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });

// --- CONFIGURATION ---
const REDIS_URL = process.env.REDIS_URL;

// Add all queue names used across your backend and workers here
const ALL_QUEUE_NAMES: string[] = [
  "bookmark-processing",
  "image-processing",
  "document-processing",
  "note-processing",
  "task-processing",
  "task-execution-processing",
];

/**
 * This script connects to Redis and completely obliterates all jobs and data
 * for the specified queues. This is a destructive operation intended for
 * development and testing environments to ensure a clean state.
 */
async function clearAllQueues() {
  if (!REDIS_URL) {
    console.error(
      "❌ FATAL: REDIS_URL environment variable is not set. Please check your .env file.",
    );
    process.exit(1);
  }

  console.log(
    `Connecting to Redis at ${REDIS_URL.split("@")[1] || REDIS_URL}...`,
  );
  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on("error", (err) => {
    console.error("Redis Connection Error:", err);
    process.exit(1);
  });

  console.log("Clearing all known queues...");
  let successCount = 0;
  let errorCount = 0;

  for (const queueName of ALL_QUEUE_NAMES) {
    try {
      const queue = new Queue(queueName, { connection });

      // obliterate() is the most powerful command. It removes the queue
      // and all its jobs in every state. Use with caution.
      await queue.obliterate({ force: true });

      console.log(`✅ Queue "${queueName}" has been completely cleared.`);
      await queue.close();
      successCount++;
    } catch (error: any) {
      console.error(`❌ Failed to clear queue "${queueName}":`, error.message);
      errorCount++;
    }
  }

  console.log(
    `\n✨ Done. Successfully cleared ${successCount} queues. Failed to clear ${errorCount} queues.`,
  );
  await connection.quit();
  console.log("Redis connection closed.");
}

// Execute the script
clearAllQueues().catch((err) => {
  console.error(
    "An unexpected error occurred during the cleanup process:",
    err,
  );
  process.exit(1);
});
