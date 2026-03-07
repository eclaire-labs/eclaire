import type { ChannelPlatform } from "@eclaire/core/types";
import type { ChannelAdapter } from "./types.js";

export class ChannelRegistry {
  private adapters = new Map<ChannelPlatform, ChannelAdapter>();

  register(adapter: ChannelAdapter): void {
    if (this.adapters.has(adapter.platform)) {
      throw new Error(
        `Adapter already registered for platform: ${adapter.platform}`,
      );
    }
    this.adapters.set(adapter.platform, adapter);
  }

  get(platform: ChannelPlatform): ChannelAdapter {
    const adapter = this.adapters.get(platform);
    if (!adapter) {
      throw new Error(`No adapter registered for platform: ${platform}`);
    }
    return adapter;
  }

  has(platform: ChannelPlatform): boolean {
    return this.adapters.has(platform);
  }

  list(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  /** Start all adapters that have runtime lifecycle. */
  async startAll(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      if (adapter.startAll) {
        await adapter.startAll();
      }
    }
  }

  /** Stop all adapters. */
  async stopAll(): Promise<void> {
    const stops = Array.from(this.adapters.values())
      .filter((a) => a.stopAll)
      .map((a) => a.stopAll!());
    await Promise.all(stops);
  }
}
