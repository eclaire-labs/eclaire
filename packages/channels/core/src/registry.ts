import type { ChannelAdapter, ChannelPlatform } from "./types.js";

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

  /** Start all adapters that have runtime lifecycle (in parallel). */
  async startAll(): Promise<void> {
    const starts = Array.from(this.adapters.values())
      .filter((a) => a.startAll)
      .map((a) =>
        a.startAll?.().catch((error) => {
          // Safety net: each adapter already logs its own errors internally.
          console.error(
            `Channel adapter ${a.platform} startAll failed:`,
            error,
          );
        }),
      );
    await Promise.all(starts);
  }

  /** Stop all adapters. */
  async stopAll(): Promise<void> {
    const stops = Array.from(this.adapters.values())
      .filter((a) => a.stopAll)
      .map((a) => a.stopAll?.());
    await Promise.all(stops);
  }
}
