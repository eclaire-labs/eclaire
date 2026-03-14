import { describe, expect, it, vi } from "vitest";
import { ChannelRegistry } from "../registry.js";
import type { ChannelAdapter } from "../types.js";

function createMockAdapter(
  platform: "telegram" | "slack" | "whatsapp" | "email" | "discord",
  overrides?: Partial<ChannelAdapter>,
): ChannelAdapter {
  return {
    platform,
    capabilities: ["notification"],
    validateAndEncryptConfig: vi.fn().mockResolvedValue({}),
    decryptConfig: vi.fn().mockReturnValue({}),
    send: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

describe("ChannelRegistry", () => {
  it("registers and retrieves an adapter", () => {
    const registry = new ChannelRegistry();
    const adapter = createMockAdapter("telegram");
    registry.register(adapter);

    expect(registry.get("telegram")).toBe(adapter);
    expect(registry.has("telegram")).toBe(true);
  });

  it("throws on duplicate registration", () => {
    const registry = new ChannelRegistry();
    registry.register(createMockAdapter("telegram"));

    expect(() => registry.register(createMockAdapter("telegram"))).toThrow(
      "Adapter already registered for platform: telegram",
    );
  });

  it("throws when getting unregistered platform", () => {
    const registry = new ChannelRegistry();

    expect(() => registry.get("slack")).toThrow(
      "No adapter registered for platform: slack",
    );
  });

  it("has() returns false for unregistered platform", () => {
    const registry = new ChannelRegistry();
    expect(registry.has("slack")).toBe(false);
  });

  it("lists all registered adapters", () => {
    const registry = new ChannelRegistry();
    const telegram = createMockAdapter("telegram");
    const slack = createMockAdapter("slack");
    registry.register(telegram);
    registry.register(slack);

    const adapters = registry.list();
    expect(adapters).toHaveLength(2);
    expect(adapters).toContain(telegram);
    expect(adapters).toContain(slack);
  });

  it("startAll() delegates to each adapter's startAll", async () => {
    const registry = new ChannelRegistry();
    const startAll1 = vi.fn().mockResolvedValue(undefined);
    const startAll2 = vi.fn().mockResolvedValue(undefined);
    registry.register(createMockAdapter("telegram", { startAll: startAll1 }));
    registry.register(createMockAdapter("slack", { startAll: startAll2 }));

    await registry.startAll();

    expect(startAll1).toHaveBeenCalledOnce();
    expect(startAll2).toHaveBeenCalledOnce();
  });

  it("startAll() skips adapters without startAll", async () => {
    const registry = new ChannelRegistry();
    registry.register(createMockAdapter("telegram"));

    // Should not throw
    await registry.startAll();
  });

  it("startAll() runs adapters in parallel", async () => {
    const registry = new ChannelRegistry();
    const callOrder: string[] = [];

    const startAll1 = vi.fn().mockImplementation(async () => {
      callOrder.push("telegram-start");
      await new Promise((r) => setTimeout(r, 50));
      callOrder.push("telegram-end");
    });
    const startAll2 = vi.fn().mockImplementation(async () => {
      callOrder.push("slack-start");
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push("slack-end");
    });

    registry.register(createMockAdapter("telegram", { startAll: startAll1 }));
    registry.register(createMockAdapter("slack", { startAll: startAll2 }));

    await registry.startAll();

    // Both should start before either finishes (parallel)
    expect(callOrder.indexOf("slack-start")).toBeLessThan(
      callOrder.indexOf("telegram-end"),
    );
  });

  it("startAll() continues even if one adapter throws", async () => {
    const registry = new ChannelRegistry();
    const failingStart = vi.fn().mockRejectedValue(new Error("boom"));
    const successStart = vi.fn().mockResolvedValue(undefined);

    registry.register(
      createMockAdapter("telegram", { startAll: failingStart }),
    );
    registry.register(createMockAdapter("slack", { startAll: successStart }));

    // Should not throw
    await registry.startAll();

    expect(failingStart).toHaveBeenCalledOnce();
    expect(successStart).toHaveBeenCalledOnce();
  });

  it("stopAll() delegates to each adapter's stopAll in parallel", async () => {
    const registry = new ChannelRegistry();
    const stopAll1 = vi.fn().mockResolvedValue(undefined);
    const stopAll2 = vi.fn().mockResolvedValue(undefined);
    registry.register(createMockAdapter("telegram", { stopAll: stopAll1 }));
    registry.register(createMockAdapter("slack", { stopAll: stopAll2 }));

    await registry.stopAll();

    expect(stopAll1).toHaveBeenCalledOnce();
    expect(stopAll2).toHaveBeenCalledOnce();
  });

  it("stopAll() skips adapters without stopAll", async () => {
    const registry = new ChannelRegistry();
    registry.register(createMockAdapter("telegram"));

    // Should not throw
    await registry.stopAll();
  });
});
