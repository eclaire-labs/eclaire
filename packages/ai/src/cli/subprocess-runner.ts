/**
 * CLI Subprocess Runner
 *
 * Spawns CLI tools as child processes, reads JSONL from stdout,
 * and produces CliEvents or OpenAI-compatible SSE streams.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createLazyLogger, getErrorMessage } from "../logger.js";
import type { AIResponse, AIStreamResponse } from "../types.js";
import { buildAIResponse, cliEventsToSSEStream } from "./sse-encoder.js";
import type { CliEvent, CliJsonlDecoder, CliSpawnConfig } from "./types.js";

const getLogger = createLazyLogger("cli-runner");

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Gracefully terminate a child process: SIGTERM → wait → SIGKILL
 */
export async function terminateProcess(
  proc: ChildProcess,
  gracefulShutdownMs: number,
): Promise<void> {
  if (proc.exitCode !== null || proc.killed) return;

  proc.kill("SIGTERM");

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(() => {
      if (proc.exitCode === null && !proc.killed) {
        proc.kill("SIGKILL");
      }
      done();
    }, gracefulShutdownMs);

    proc.once("exit", () => {
      clearTimeout(timer);
      done();
    });
  });
}

// =============================================================================
// SUBPROCESS RUNNER
// =============================================================================

export class CliSubprocessRunner {
  constructor(private readonly decoder: CliJsonlDecoder) {}

  /**
   * Non-streaming: run CLI, collect all events, return AIResponse
   */
  async run(config: CliSpawnConfig, signal?: AbortSignal): Promise<AIResponse> {
    const events: CliEvent[] = [];

    for await (const event of this.iterEvents(config, signal)) {
      events.push(event);
    }

    return buildAIResponse(events);
  }

  /**
   * Streaming: run CLI, return a ReadableStream of SSE bytes (OpenAI format)
   * so existing LLMStreamParser can consume it unchanged.
   */
  runStream(config: CliSpawnConfig, signal?: AbortSignal): AIStreamResponse {
    return cliEventsToSSEStream(this.iterEvents(config, signal));
  }

  /**
   * Core async generator: spawn process, yield decoded CliEvents
   */
  private async *iterEvents(
    config: CliSpawnConfig,
    signal?: AbortSignal,
  ): AsyncGenerator<CliEvent> {
    const logger = getLogger();
    const {
      command,
      args,
      env,
      cwd,
      stdinPayload,
      timeout,
      gracefulShutdownMs,
    } = config;

    logger.debug(
      { command, args, cwd, hasStdin: !!stdinPayload },
      "Spawning CLI subprocess",
    );

    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: env ? { ...process.env, ...env } : undefined,
      cwd,
    });

    // Abort signal handling
    const onAbort = () => {
      logger.info({}, "Abort signal received, terminating CLI process");
      terminateProcess(proc, gracefulShutdownMs);
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    // Timeout handling
    const timeoutTimer = setTimeout(() => {
      logger.warn({ timeout }, "CLI subprocess timed out");
      terminateProcess(proc, gracefulShutdownMs);
    }, timeout);

    // Send stdin payload if needed
    if (stdinPayload && proc.stdin) {
      proc.stdin.write(stdinPayload);
      proc.stdin.end();
    } else if (proc.stdin) {
      proc.stdin.end();
    }

    // Collect stderr for diagnostics
    const stderrChunks: string[] = [];
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk.toString());
    });

    // Read stdout line-by-line and decode JSONL
    try {
      let buffer = "";

      const stdout = proc.stdout;
      if (!stdout) throw new Error("CLI subprocess stdout is not available");
      for await (const chunk of stdout) {
        buffer += chunk.toString();

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const events = this.decoder.decodeLine(trimmed);
            for (const event of events) {
              yield event;
            }
          } catch (error) {
            logger.warn(
              { line: trimmed, error: getErrorMessage(error) },
              "Failed to decode CLI JSONL line",
            );
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const events = this.decoder.decodeLine(buffer.trim());
          for (const event of events) {
            yield event;
          }
        } catch (error) {
          logger.warn(
            { line: buffer.trim(), error: getErrorMessage(error) },
            "Failed to decode final CLI JSONL line",
          );
        }
      }
    } finally {
      clearTimeout(timeoutTimer);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    }

    // Wait for process to exit
    const exitCode = await new Promise<number | null>((resolve) => {
      if (proc.exitCode !== null) {
        resolve(proc.exitCode);
      } else {
        proc.once("exit", (code) => resolve(code));
      }
    });

    if (exitCode !== null && exitCode !== 0) {
      const stderr = stderrChunks.join("");
      logger.warn(
        { exitCode, stderr: stderr.slice(0, 500) },
        "CLI process exited with non-zero code",
      );

      yield {
        type: "error",
        message: `CLI process exited with code ${exitCode}${stderr ? `: ${stderr.slice(0, 200)}` : ""}`,
      };
    }

    logger.debug({ exitCode }, "CLI subprocess finished");
  }
}
