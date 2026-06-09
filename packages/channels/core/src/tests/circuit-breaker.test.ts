import { describe, expect, it, vi } from "vitest";

import { createCircuitBreaker } from "../circuit-breaker.js";

describe("createCircuitBreaker", () => {
  it("runs the function and swallows errors", async () => {
    const breaker = createCircuitBreaker();
    await expect(
      breaker.run("key", async () => {
        throw new Error("boom");
      }),
    ).resolves.toBeUndefined();
  });

  it("suspends a key after maxConsecutiveFailures and calls onSuspend once", async () => {
    const breaker = createCircuitBreaker({ maxConsecutiveFailures: 3 });
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    const onSuspend = vi.fn();

    for (let i = 0; i < 5; i++) {
      await breaker.run("key", fn, onSuspend);
    }

    // 3 failures suspend the key; further runs are no-ops
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onSuspend).toHaveBeenCalledTimes(1);
    expect(onSuspend).toHaveBeenCalledWith(3);
  });

  it("tracks keys independently", async () => {
    const breaker = createCircuitBreaker({ maxConsecutiveFailures: 1 });
    await breaker.run("bad", async () => {
      throw new Error("boom");
    });

    const fn = vi.fn(async () => {});
    await breaker.run("good", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("resets the failure counter on success", async () => {
    const breaker = createCircuitBreaker({ maxConsecutiveFailures: 2 });
    const onSuspend = vi.fn();

    await breaker.run("key", async () => {
      throw new Error("boom");
    });
    await breaker.run("key", async () => {}); // success resets
    await breaker.run(
      "key",
      async () => {
        throw new Error("boom");
      },
      onSuspend,
    );

    expect(onSuspend).not.toHaveBeenCalled();
  });

  it("only counts failures matching shouldCountFailure", async () => {
    const breaker = createCircuitBreaker({
      maxConsecutiveFailures: 1,
      shouldCountFailure: (err) =>
        err instanceof Error && err.message === "fatal",
    });
    const onSuspend = vi.fn();

    await breaker.run(
      "key",
      async () => {
        throw new Error("transient");
      },
      onSuspend,
    );
    expect(onSuspend).not.toHaveBeenCalled();

    await breaker.run(
      "key",
      async () => {
        throw new Error("fatal");
      },
      onSuspend,
    );
    expect(onSuspend).toHaveBeenCalledWith(1);
  });

  it("reset() clears suspension for a key", async () => {
    const breaker = createCircuitBreaker({ maxConsecutiveFailures: 1 });
    await breaker.run("key", async () => {
      throw new Error("boom");
    });

    breaker.reset("key");

    const fn = vi.fn(async () => {});
    await breaker.run("key", fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
