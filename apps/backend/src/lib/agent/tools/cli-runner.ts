import { execa } from "execa";

export type AllowedCliBinary = "agent-browser";

export interface CliRunResult {
  binary: AllowedCliBinary;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunAllowedCliCommandOptions {
  binary: AllowedCliBinary;
  args: string[];
  cwd?: string;
  timeoutMs: number;
  env?: Record<string, string | undefined>;
  maxOutputChars?: number;
}

export class CliExecutionError extends Error {
  public readonly kind: "not_allowed" | "failed" | "timed_out";
  public readonly binary: string;
  public readonly args: string[];
  public readonly exitCode?: number;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(
    message: string,
    options: {
      kind: "not_allowed" | "failed" | "timed_out";
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
  } = options;

  if (!ALLOWED_CLI_BINARIES.has(binary)) {
    throw new CliExecutionError(`CLI binary '${binary}' is not allowlisted`, {
      kind: "not_allowed",
      binary,
      args,
    });
  }

  try {
    const result = await execa(binary, args, {
      cwd,
      env,
      reject: false,
      shell: false,
      timeout: timeoutMs,
      maxBuffer: Math.max(maxOutputChars * 4, 64 * 1024),
      windowsHide: true,
    });

    const stdout = truncateOutput(result.stdout, maxOutputChars);
    const stderr = truncateOutput(result.stderr, maxOutputChars);

    if (result.exitCode !== 0) {
      throw new CliExecutionError(
        `CLI command '${binary}' exited with code ${result.exitCode}`,
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

    return {
      binary,
      args,
      stdout,
      stderr,
      exitCode: result.exitCode,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "timedOut" in error &&
      error.timedOut === true
    ) {
      const stdout =
        "stdout" in error && typeof error.stdout === "string"
          ? truncateOutput(error.stdout, maxOutputChars)
          : "";
      const stderr =
        "stderr" in error && typeof error.stderr === "string"
          ? truncateOutput(error.stderr, maxOutputChars)
          : "";

      throw new CliExecutionError(
        `CLI command '${binary}' timed out after ${timeoutMs}ms`,
        {
          kind: "timed_out",
          binary,
          args,
          stdout,
          stderr,
        },
      );
    }

    throw error;
  }
}
