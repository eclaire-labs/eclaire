import { execa } from "execa";
import { createChildLogger } from "../../logger.js";

const logger = createChildLogger("cli-runner");

export type AllowedCliBinary = "agent-browser";

export type CliErrorKind = "not_allowed" | "failed" | "timed_out" | "canceled";

export interface CliRunResult {
  binary: AllowedCliBinary;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface RunAllowedCliCommandOptions {
  binary: AllowedCliBinary;
  args: string[];
  cwd?: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
  maxOutputChars?: number;
  signal?: AbortSignal;
}

export class CliExecutionError extends Error {
  public readonly kind: CliErrorKind;
  public readonly binary: string;
  public readonly args: string[];
  public readonly exitCode?: number;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(
    message: string,
    options: {
      kind: CliErrorKind;
      binary: string;
      args: string[];
      exitCode?: number;
      stdout?: string;
      stderr?: string;
    },
  ) {
    super(message);
    this.name = "CliExecutionError";
    this.kind = options.kind;
    this.binary = options.binary;
    this.args = options.args;
    this.exitCode = options.exitCode;
    this.stdout = options.stdout ?? "";
    this.stderr = options.stderr ?? "";
  }
}

const ALLOWED_CLI_BINARIES = new Set<AllowedCliBinary>(["agent-browser"]);

function truncateOutput(output: string, maxOutputChars: number): string {
  if (output.length <= maxOutputChars) {
    return output;
  }

  return `${output.slice(0, maxOutputChars)}\n[truncated]`;
}

function extractPartialOutput(
  source: Record<string, unknown>,
  maxOutputChars: number,
): { stdout: string; stderr: string } {
  return {
    stdout:
      typeof source.stdout === "string"
        ? truncateOutput(source.stdout, maxOutputChars)
        : "",
    stderr:
      typeof source.stderr === "string"
        ? truncateOutput(source.stderr, maxOutputChars)
        : "",
  };
}

export async function runAllowedCliCommand(
  options: RunAllowedCliCommandOptions,
): Promise<CliRunResult> {
  const {
    binary,
    args,
    cwd,
    timeoutMs,
    env,
    maxOutputChars = 12_000,
    signal,
  } = options;

  if (!ALLOWED_CLI_BINARIES.has(binary)) {
    throw new CliExecutionError(`CLI binary '${binary}' is not allowlisted`, {
      kind: "not_allowed",
      binary,
      args,
    });
  }

  const startTime = performance.now();
  logger.debug({ binary, args }, "CLI command starting");

  try {
    const result = await execa(binary, args, {
      cwd,
      env,
      reject: false,
      shell: false,
      timeout: timeoutMs,
      maxBuffer: Math.max(maxOutputChars * 4, 64 * 1024),
      windowsHide: true,
      ...(signal && { cancelSignal: signal }),
    });

    const durationMs = Math.round(performance.now() - startTime);
    const stdout = truncateOutput(result.stdout, maxOutputChars);
    const stderr = truncateOutput(result.stderr, maxOutputChars);

    if (result.isCanceled) {
      throw new CliExecutionError(`CLI command '${binary}' was canceled`, {
        kind: "canceled",
        binary,
        args,
        stdout,
        stderr,
      });
    }

    if (result.timedOut) {
      throw new CliExecutionError(
        `CLI command '${binary}' timed out after ${timeoutMs}ms`,
        { kind: "timed_out", binary, args, stdout, stderr },
      );
    }

    if (result.exitCode !== 0) {
      const detail = result.isMaxBuffer
        ? " (output exceeded buffer limit)"
        : "";
      throw new CliExecutionError(
        `CLI command '${binary}' exited with code ${result.exitCode}${detail}`,
        {
          kind: "failed",
          binary,
          args,
          exitCode: result.exitCode ?? undefined,
          stdout,
          stderr,
        },
      );
    }

    logger.debug({ binary, exitCode: 0, durationMs }, "CLI command completed");

    return {
      binary,
      args,
      stdout,
      stderr,
      exitCode: result.exitCode,
      durationMs,
    };
  } catch (error) {
    if (error instanceof CliExecutionError) {
      const durationMs = Math.round(performance.now() - startTime);
      logger.warn(
        { binary, kind: error.kind, durationMs },
        "CLI command failed",
      );
      throw error;
    }

    // Handle cases where execa throws despite reject:false (e.g., ENOENT, spawn errors)
    if (typeof error === "object" && error !== null) {
      const execaError = error as Record<string, unknown>;
      const partial = extractPartialOutput(execaError, maxOutputChars);

      if (execaError.isCanceled === true) {
        throw new CliExecutionError(`CLI command '${binary}' was canceled`, {
          kind: "canceled",
          binary,
          args,
          ...partial,
        });
      }

      if (execaError.timedOut === true) {
        throw new CliExecutionError(
          `CLI command '${binary}' timed out after ${timeoutMs}ms`,
          { kind: "timed_out", binary, args, ...partial },
        );
      }
    }

    throw error;
  }
}
