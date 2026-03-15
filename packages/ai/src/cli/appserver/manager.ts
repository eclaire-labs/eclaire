/**
 * Codex App-Server Manager
 *
 * Manages the lifecycle of a long-lived `codex app-server` child process.
 * Handles the initialize handshake, thread management, turn execution,
 * approval auto-response, and auto-restart on crash.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { Mutex } from "async-mutex";
import { interpolateEnvVars } from "../../config.js";
import { createLazyLogger, getErrorMessage } from "../../logger.js";
import type { AppServerConfig, CliConfig } from "../../types.js";
import type { CliEvent } from "../types.js";
import { terminateProcess } from "../subprocess-runner.js";
import { decodeAppServerNotification } from "./decoder.js";
import { JsonRpcTransport } from "./jsonrpc.js";
import type {
  InitializeResult,
  ThreadResumeResult,
  ThreadStartResult,
  TurnStartParams,
} from "./types.js";

const getLogger = createLazyLogger("codex-appserver");

const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_RESTART_BACKOFF_MS = 1_000;
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 2_000;

// =============================================================================
// MANAGER
// =============================================================================

export class CodexAppServerManager {
  private proc: ChildProcess | null = null;
  private transport: JsonRpcTransport | null = null;
  private initialized = false;
  private shutdownRequested = false;
  private restartCount = 0;

  private readonly initMutex = new Mutex();
  private readonly threadMutexes = new Map<string, Mutex>();

  private readonly appServerConfig: AppServerConfig;
  private readonly gracefulShutdownMs: number;

  constructor(private readonly cli: CliConfig) {
    this.appServerConfig = cli.appServer ?? {};
    this.gracefulShutdownMs =
      cli.gracefulShutdownMs ?? DEFAULT_GRACEFUL_SHUTDOWN_MS;
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Ensure the app-server process is running and initialized. Idempotent.
   */
  async ensureReady(): Promise<void> {
    if (this.initialized && this.transport && !this.transport.isClosed) {
      return;
    }

    const release = await this.initMutex.acquire();
    try {
      // Double-check after acquiring mutex
      if (this.initialized && this.transport && !this.transport.isClosed) {
        return;
      }
      await this.startProcess();
    } finally {
      release();
    }
  }

  /**
   * Start a new thread. Returns the threadId.
   */
  async startThread(): Promise<string> {
    await this.ensureReady();
    const t = this.getTransport();
    const result = await t.sendRequest<ThreadStartResult>("thread/start", {});
    return result.threadId;
  }

  /**
   * Resume an existing thread. Returns the threadId.
   */
  async resumeThread(threadId: string): Promise<string> {
    await this.ensureReady();
    const t = this.getTransport();
    const result = await t.sendRequest<ThreadResumeResult>("thread/resume", {
      threadId,
    });
    return result.threadId;
  }

  /**
   * Start a turn and yield CliEvents as they stream back.
   * If threadId is provided, resumes that thread; otherwise starts a new one.
   */
  async *startTurn(
    threadId: string | undefined,
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<CliEvent> {
    const logger = getLogger();
    await this.ensureReady();
    const t = this.getTransport();

    // Resolve thread
    const resolvedThreadId = threadId
      ? await this.resumeThread(threadId)
      : await this.startThread();

    // Yield the started event with session ID
    yield { type: "started", sessionId: resolvedThreadId };

    // Acquire per-thread mutex (serialize turns on same thread)
    const threadMutex = this.getThreadMutex(resolvedThreadId);
    const release = await threadMutex.acquire();

    try {
      // Set up event collection via notification handler
      const eventQueue: CliEvent[] = [];
      let turnDone = false;
      let resolveWait: (() => void) | null = null;

      const pushEvents = (events: CliEvent[]) => {
        for (const event of events) {
          eventQueue.push(event);
          if (event.type === "completed") {
            turnDone = true;
          }
        }
        // Wake up the consumer if it's waiting
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      };

      // Save and replace notification handler
      const prevNotificationHandler = t.onNotification;
      t.setNotificationHandler((method, params) => {
        // Only process events for our thread
        const threadParam = (params as { threadId?: string }).threadId;
        if (threadParam && threadParam !== resolvedThreadId) {
          // Delegate to previous handler for other threads
          if (prevNotificationHandler) {
            prevNotificationHandler(method, params);
          }
          return;
        }

        const events = decodeAppServerNotification(method, params);
        pushEvents(events);
      });

      // Save and replace server request handler (approvals)
      const prevServerRequestHandler = t.onServerRequest;
      t.setServerRequestHandler((method, params, id) => {
        if (method === "approval/requested") {
          const autoApprove = this.appServerConfig.autoApprove ?? true;
          if (autoApprove) {
            logger.info(
              { itemId: (params as { itemId?: string }).itemId, method },
              "Auto-approving app-server request",
            );
            t.sendResponse(id, { approved: true });
          } else {
            logger.warn(
              { itemId: (params as { itemId?: string }).itemId },
              "Declining app-server approval (autoApprove=false)",
            );
            t.sendResponse(id, { approved: false });
          }

          // Emit an action event for the approval
          pushEvents([
            {
              type: "action",
              phase: "started",
              name: `approval: ${(params as { type?: string }).type ?? "unknown"}`,
              detail: params as Record<string, unknown>,
            },
          ]);
          return;
        }

        // Delegate unknown server requests
        if (prevServerRequestHandler) {
          prevServerRequestHandler(method, params, id);
        }
      });

      // Send turn/start
      const turnParams: TurnStartParams = {
        threadId: resolvedThreadId,
        input: [{ type: "text", text: prompt }],
      };

      t.sendNotification(
        "turn/start",
        turnParams as unknown as Record<string, unknown>,
      );

      // Yield events as they arrive
      while (!turnDone) {
        // Check abort signal
        if (signal?.aborted) {
          logger.info({}, "Turn aborted by signal");
          break;
        }

        // Drain queued events
        while (eventQueue.length > 0) {
          const event = eventQueue.shift();
          if (event) {
            yield event;
            if (event.type === "completed") {
              turnDone = true;
              break;
            }
          }
        }

        if (turnDone) break;

        // Wait for more events
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
          // Also wake up on abort
          if (signal) {
            signal.addEventListener("abort", () => resolve(), { once: true });
          }
          // Safety timeout to avoid hanging forever
          setTimeout(resolve, 1000);
        });
      }

      // Drain any remaining events after turn is done
      while (eventQueue.length > 0) {
        const event = eventQueue.shift();
        if (event) yield event;
      }

      // Restore previous handlers
      if (prevNotificationHandler) {
        t.setNotificationHandler(prevNotificationHandler);
      }
      if (prevServerRequestHandler) {
        t.setServerRequestHandler(prevServerRequestHandler);
      }
    } finally {
      release();
    }
  }

  /**
   * Gracefully shut down the app-server process.
   */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true;
    this.initialized = false;

    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }

    if (this.proc) {
      await terminateProcess(this.proc, this.gracefulShutdownMs);
      this.proc = null;
    }

    this.threadMutexes.clear();
  }

  // ===========================================================================
  // INTERNAL
  // ===========================================================================

  /**
   * Get the transport, throwing if not ready.
   */
  private getTransport(): JsonRpcTransport {
    if (!this.transport || this.transport.isClosed) {
      throw new Error("App-server transport not available");
    }
    return this.transport;
  }

  private async startProcess(): Promise<void> {
    const logger = getLogger();

    // Build spawn args: codex app-server
    const args = [...(this.cli.staticArgs ?? [])];

    // Interpolate env vars
    let env: Record<string, string> | undefined;
    if (this.cli.env) {
      env = {};
      for (const [key, value] of Object.entries(this.cli.env)) {
        env[key] = interpolateEnvVars(value, false);
      }
    }

    logger.info(
      { command: this.cli.command, args },
      "Starting codex app-server process",
    );

    const proc = spawn(this.cli.command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : undefined,
    });

    // Collect stderr for diagnostics
    proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        logger.debug({ stderr: text }, "App-server stderr");
      }
    });

    this.proc = proc;
    this.transport = new JsonRpcTransport(proc, this.cli.timeout ?? 30_000);

    // Handle unexpected exit for auto-restart
    proc.once("exit", (code, sig) => {
      logger.warn(
        { code, signal: sig },
        "App-server process exited unexpectedly",
      );
      this.initialized = false;
      this.proc = null;
      this.transport = null;

      if (!this.shutdownRequested) {
        this.maybeRestart();
      }
    });

    // Perform initialize handshake
    try {
      const initResult = await this.transport.sendRequest<InitializeResult>(
        "initialize",
        {
          clientInfo: {
            name: "eclaire",
            title: "Eclaire",
            version: "1.0.0",
          },
        },
      );

      logger.info(
        { serverInfo: initResult?.serverInfo },
        "App-server initialized",
      );

      // Send the initialized notification
      this.transport.sendNotification("initialized");

      this.initialized = true;
      this.restartCount = 0; // Reset on successful init
    } catch (error) {
      logger.error(
        { error: getErrorMessage(error) },
        "Failed to initialize app-server",
      );
      await this.cleanup();
      throw error;
    }
  }

  private maybeRestart(): void {
    const logger = getLogger();
    const maxRestarts =
      this.appServerConfig.maxRestarts ?? DEFAULT_MAX_RESTARTS;
    const backoffMs =
      this.appServerConfig.restartBackoffMs ?? DEFAULT_RESTART_BACKOFF_MS;

    if (this.restartCount >= maxRestarts) {
      logger.error(
        { restartCount: this.restartCount, maxRestarts },
        "App-server max restarts reached, giving up",
      );
      return;
    }

    this.restartCount++;
    const delay = backoffMs * 2 ** (this.restartCount - 1);

    logger.info(
      { restartCount: this.restartCount, delayMs: delay },
      "Scheduling app-server restart",
    );

    setTimeout(() => {
      if (!this.shutdownRequested) {
        this.ensureReady().catch((err) => {
          logger.error(
            { error: getErrorMessage(err) },
            "App-server restart failed",
          );
        });
      }
    }, delay);
  }

  private async cleanup(): Promise<void> {
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
    if (this.proc) {
      await terminateProcess(this.proc, this.gracefulShutdownMs);
      this.proc = null;
    }
    this.initialized = false;
  }

  private getThreadMutex(threadId: string): Mutex {
    let mutex = this.threadMutexes.get(threadId);
    if (!mutex) {
      mutex = new Mutex();
      this.threadMutexes.set(threadId, mutex);
    }
    return mutex;
  }
}
