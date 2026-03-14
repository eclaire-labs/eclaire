import { beforeEach, describe, expect, it, vi } from "vitest";
import { execa } from "execa";
import {
  type CliExecutionError,
  runAllowedCliCommand,
} from "../../lib/agent/tools/cli-runner.js";

vi.mock("execa", () => ({
  execa: vi.fn(),
}));

describe("runAllowedCliCommand", () => {
  beforeEach(() => {
    vi.mocked(execa).mockReset();
  });

  it("rejects binaries that are not allowlisted", async () => {
    await expect(
      runAllowedCliCommand({
        binary: "not-allowed" as never,
        args: ["--help"],
        timeoutMs: 1_000,
      }),
    ).rejects.toMatchObject({
      kind: "not_allowed",
    } satisfies Partial<CliExecutionError>);
  });

  it("executes without a shell and returns stdout on success", async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      isCanceled: false,
      timedOut: false,
      isMaxBuffer: false,
    } as Awaited<ReturnType<typeof execa>>);

    const result = await runAllowedCliCommand({
      binary: "agent-browser",
      args: ["--help"],
      timeoutMs: 5_000,
      env: { TEST_ENV: "1" },
    });

    expect(result.stdout).toBe("ok");
    expect(result).toHaveProperty("durationMs");
    expect(execa).toHaveBeenCalledWith(
      "agent-browser",
      ["--help"],
      expect.objectContaining({
        env: { TEST_ENV: "1" },
        reject: false,
        shell: false,
        timeout: 5_000,
      }),
    );
  });

  it("throws timed_out when the process times out", async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: "partial",
      stderr: "timeout warning",
      exitCode: undefined,
      timedOut: true,
      isCanceled: false,
      isMaxBuffer: false,
    } as unknown as Awaited<ReturnType<typeof execa>>);

    await expect(
      runAllowedCliCommand({
        binary: "agent-browser",
        args: ["open", "https://example.com"],
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({
      kind: "timed_out",
      stdout: "partial",
      stderr: "timeout warning",
    } satisfies Partial<CliExecutionError>);
  });

  it("throws failed with maxBuffer detail when output exceeds buffer", async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: "x".repeat(100),
      stderr: "",
      exitCode: 1,
      timedOut: false,
      isCanceled: false,
      isMaxBuffer: true,
    } as unknown as Awaited<ReturnType<typeof execa>>);

    await expect(
      runAllowedCliCommand({
        binary: "agent-browser",
        args: ["snapshot"],
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({
      kind: "failed",
      message: expect.stringContaining("output exceeded buffer limit"),
    } satisfies Partial<CliExecutionError>);
  });

  it("throws canceled when the signal is aborted", async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: undefined,
      timedOut: false,
      isCanceled: true,
      isMaxBuffer: false,
    } as unknown as Awaited<ReturnType<typeof execa>>);

    const controller = new AbortController();
    await expect(
      runAllowedCliCommand({
        binary: "agent-browser",
        args: ["snapshot"],
        timeoutMs: 5_000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      kind: "canceled",
    } satisfies Partial<CliExecutionError>);
  });

  it("passes cancelSignal to execa when signal is provided", async () => {
    const controller = new AbortController();

    vi.mocked(execa).mockResolvedValue({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      isCanceled: false,
      timedOut: false,
      isMaxBuffer: false,
    } as Awaited<ReturnType<typeof execa>>);

    await runAllowedCliCommand({
      binary: "agent-browser",
      args: ["--help"],
      timeoutMs: 5_000,
      signal: controller.signal,
    });

    expect(execa).toHaveBeenCalledWith(
      "agent-browser",
      ["--help"],
      expect.objectContaining({
        cancelSignal: controller.signal,
      }),
    );
  });

  it("throws failed on non-zero exit code", async () => {
    vi.mocked(execa).mockResolvedValue({
      stdout: "",
      stderr: "something went wrong",
      exitCode: 1,
      timedOut: false,
      isCanceled: false,
      isMaxBuffer: false,
    } as unknown as Awaited<ReturnType<typeof execa>>);

    await expect(
      runAllowedCliCommand({
        binary: "agent-browser",
        args: ["open", "https://example.com"],
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({
      kind: "failed",
      exitCode: 1,
      stderr: "something went wrong",
    } satisfies Partial<CliExecutionError>);
  });

  it("handles execa throwing with timedOut (fallback catch)", async () => {
    vi.mocked(execa).mockRejectedValue({
      timedOut: true,
      isCanceled: false,
      stdout: "partial output",
      stderr: "",
    });

    await expect(
      runAllowedCliCommand({
        binary: "agent-browser",
        args: ["open", "https://example.com"],
        timeoutMs: 5_000,
      }),
    ).rejects.toMatchObject({
      kind: "timed_out",
      stdout: "partial output",
    } satisfies Partial<CliExecutionError>);
  });

  it("truncates output exceeding maxOutputChars", async () => {
    const longOutput = "a".repeat(20_000);
    vi.mocked(execa).mockResolvedValue({
      stdout: longOutput,
      stderr: "",
      exitCode: 0,
      isCanceled: false,
      timedOut: false,
      isMaxBuffer: false,
    } as Awaited<ReturnType<typeof execa>>);

    const result = await runAllowedCliCommand({
      binary: "agent-browser",
      args: ["snapshot"],
      timeoutMs: 5_000,
      maxOutputChars: 100,
    });

    expect(result.stdout.length).toBeLessThan(longOutput.length);
    expect(result.stdout).toContain("[truncated]");
  });
});
