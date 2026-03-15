/**
 * CLI Subprocess Runner
 *
 * Spawns CLI tools as child processes, reads JSONL from stdout,
 * and produces CliEvents or OpenAI-compatible SSE streams.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createLazyLogger, getErrorMessage } from "../logger.js";
import type { AIResponse, AIStreamResponse, TokenUsage } from "../types.js";
import type { CliEvent, CliJsonlDecoder, CliSpawnConfig } from "./types.js";

const getLogger = createLazyLogger("cli-runner");

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Gracefully terminate a child process: SIGTERM → wait → SIGKILL
 */
async function terminateProcess(
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

/**
 * Convert accumulated CliEvents into an AIResponse.
 */
function buildAIResponse(
  events: CliEvent[],
  estimatedInputTokens?: number,
): AIResponse {
  const contentParts: string[] = [];
  const reasoningParts: string[] = [];
  let usage: TokenUsage | undefined;
  let sessionId: string | undefined;
  let ok = true;

  for (const event of events) {
    switch (event.type) {
      case "started":
        sessionId = event.sessionId ?? sessionId;
        break;
      case "content_delta":
        contentParts.push(event.text);
        break;
      case "reasoning_delta":
        reasoningParts.push(event.text);
        break;
      case "usage":
        usage = {
          prompt_tokens: event.inputTokens,
          completion_tokens: event.outputTokens,
          total_tokens:
            event.inputTokens || event.outputTokens
              ? (event.inputTokens ?? 0) + (event.outputTokens ?? 0)
              : undefined,
        };
        break;
      case "completed":
        sessionId = event.sessionId ?? sessionId;
        ok = event.ok;
        // Use the completed answer if we didn't accumulate content deltas
        if (contentParts.length === 0 && event.answer) {
          contentParts.push(event.answer);
        }
        break;
      case "error":
        ok = false;
        break;
    }
  }

  const reasoning = reasoningParts.join("");
  return {
    content: contentParts.join(""),
    reasoning: reasoning.trim() ? reasoning : undefined,
    usage,
    estimatedInputTokens,
    finishReason: ok ? "stop" : undefined,
    cliSessionId: sessionId,
  };
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
    const encoder = new TextEncoder();
    const logger = getLogger();
    const runner = this;
    let sessionId: string | undefined;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of runner.iterEvents(config, signal)) {
            switch (event.type) {
              case "started":
                sessionId = event.sessionId;
                break;

              case "content_delta": {
                const sseData = {
                  choices: [
                    {
                      delta: { content: event.text },
                      index: 0,
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`),
                );
                break;
              }

              case "reasoning_delta": {
                const sseData = {
                  choices: [
                    {
                      delta: { reasoning: event.text },
                      index: 0,
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`),
                );
                break;
              }

              case "usage": {
                const sseData = {
                  usage: {
                    prompt_tokens: event.inputTokens,
                    completion_tokens: event.outputTokens,
                    total_tokens:
                      event.inputTokens || event.outputTokens
                        ? (event.inputTokens ?? 0) + (event.outputTokens ?? 0)
                        : undefined,
                  },
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`),
                );
                break;
              }

              case "completed": {
                sessionId = event.sessionId ?? sessionId;
                // If there's a final answer not already streamed, emit it
                if (event.answer) {
                  const sseData = {
                    choices: [
                      {
                        delta: { content: event.answer },
                        index: 0,
                        finish_reason: null,
                      },
                    ],
                  };
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`),
                  );
                }

                // Emit finish_reason
                const finishData = {
                  choices: [
                    {
                      delta: {},
                      index: 0,
                      finish_reason: event.ok ? "stop" : "error",
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(finishData)}\n\n`),
                );
                break;
              }

              case "error": {
                logger.warn(
                  { error: event.message },
                  "CLI provider error event",
                );
                break;
              }

              // action events are progress indicators, skip for SSE output
              case "action":
                break;
            }
          }
        } catch (error) {
          logger.error(
            { error: getErrorMessage(error) },
            "Error in CLI stream",
          );
          controller.error(error);
          return;
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    return { stream };
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
