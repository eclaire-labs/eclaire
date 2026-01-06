/**
 * Subprocess utilities for multi-process worker tests (H-series)
 *
 * Provides utilities to spawn worker subprocesses and collect their results.
 */

import { type ChildProcess, fork } from "child_process";
import { join } from "path";
import { createInterface } from "readline";

// Path to the worker subprocess script
const WORKER_SCRIPT = join(
  import.meta.dirname,
  "../fixtures/worker-subprocess.ts",
);

export interface WorkerConfig {
  /** Unique identifier for this worker */
  workerId: string;
  /** Name of the queue to process */
  queueName: string;
  /** Backend type: "postgres" or "redis" */
  backend: "postgres" | "redis";
  /** PostgreSQL connection URL (required for postgres) */
  databaseUrl?: string;
  /** Redis connection URL (required for redis) */
  redisUrl?: string;
  /** Exit after processing this many jobs */
  maxJobs?: number;
  /** Enable Postgres NOTIFY for faster wakeup */
  notifyEnabled?: boolean;
}

export interface ProcessedJob {
  jobId: string;
  workerId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export interface WorkerProcess {
  /** Worker identifier */
  id: string;
  /** The child process handle */
  process: ChildProcess;
  /** Jobs processed by this worker */
  processed: ProcessedJob[];
  /** Promise that resolves when worker is ready */
  ready: Promise<void>;
  /** Promise that resolves when worker exits */
  exited: Promise<number>;
  /** Kill the worker process */
  kill(): Promise<void>;
}

/**
 * Spawn a worker subprocess
 */
export function spawnWorker(config: WorkerConfig): WorkerProcess {
  const env: Record<string, string> = {
    QUEUE_NAME: config.queueName,
    BACKEND: config.backend,
    WORKER_ID: config.workerId,
  };

  if (config.databaseUrl) {
    env.DATABASE_URL = config.databaseUrl;
  }
  if (config.redisUrl) {
    env.REDIS_URL = config.redisUrl;
  }
  if (config.maxJobs !== undefined) {
    env.MAX_JOBS = String(config.maxJobs);
  }
  if (config.notifyEnabled) {
    env.NOTIFY_ENABLED = "true";
  }

  const processed: ProcessedJob[] = [];
  let readyResolve: () => void;
  let exitResolve: (code: number) => void;

  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  const exited = new Promise<number>((resolve) => {
    exitResolve = resolve;
  });

  // Spawn using tsx to run TypeScript directly
  const child = fork(WORKER_SCRIPT, [], {
    env: { ...process.env, ...env },
    execArgv: ["--import", "tsx"],
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });

  // Parse JSON lines from stdout
  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      try {
        const data = JSON.parse(line);
        if (data.type === "ready") {
          readyResolve();
        } else if (data.type === "processed") {
          processed.push({
            jobId: data.jobId,
            workerId: data.workerId,
            data: data.data,
            timestamp: Date.now(),
          });
        }
      } catch {
        // Ignore non-JSON output
      }
    });
  }

  // Capture stderr for debugging
  if (child.stderr) {
    const rl = createInterface({ input: child.stderr });
    rl.on("line", (line) => {
      console.error(`[Worker ${config.workerId}] ${line}`);
    });
  }

  child.on("exit", (code) => {
    exitResolve(code ?? 0);
  });

  const kill = async () => {
    if (!child.killed) {
      child.kill("SIGTERM");
      // Wait for graceful shutdown (max 5 seconds)
      await Promise.race([
        exited,
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  };

  return {
    id: config.workerId,
    process: child,
    processed,
    ready,
    exited,
    kill,
  };
}

/**
 * Wait for all workers to be ready
 */
export async function waitForAllReady(
  workers: WorkerProcess[],
  timeoutMs = 10000,
): Promise<void> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error("Timeout waiting for workers to be ready")),
      timeoutMs,
    );
  });

  await Promise.race([Promise.all(workers.map((w) => w.ready)), timeout]);
}

/**
 * Wait for workers to process a specific number of jobs total
 */
export async function waitForJobsProcessed(
  workers: WorkerProcess[],
  expectedCount: number,
  timeoutMs = 30000,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const totalProcessed = workers.reduce(
      (sum, w) => sum + w.processed.length,
      0,
    );
    if (totalProcessed >= expectedCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const totalProcessed = workers.reduce(
    (sum, w) => sum + w.processed.length,
    0,
  );
  throw new Error(
    `Timeout: expected ${expectedCount} jobs processed, got ${totalProcessed}`,
  );
}

/**
 * Collect all processed jobs from workers
 * Returns a map of jobId -> workerId[]
 */
export function collectResults(
  workers: WorkerProcess[],
): Map<string, string[]> {
  const results = new Map<string, string[]>();

  for (const worker of workers) {
    for (const job of worker.processed) {
      const existing = results.get(job.jobId) || [];
      existing.push(job.workerId);
      results.set(job.jobId, existing);
    }
  }

  return results;
}

/**
 * Kill all workers and wait for them to exit
 */
export async function killAllWorkers(workers: WorkerProcess[]): Promise<void> {
  await Promise.all(workers.map((w) => w.kill()));
}
