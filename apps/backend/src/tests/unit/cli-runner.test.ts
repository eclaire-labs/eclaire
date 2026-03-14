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
    } as Awaited<ReturnType<typeof execa>>);

    const result = await runAllowedCliCommand({
      binary: "agent-browser",
      args: ["--help"],
      timeoutMs: 5_000,
      env: { TEST_ENV: "1" },
    });

    expect(result.stdout).toBe("ok");
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
});
