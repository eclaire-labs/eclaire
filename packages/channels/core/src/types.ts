import type { ChannelCapability, ChannelPlatform } from "@eclaire/core/types";

/** Minimal channel record shape needed by adapters (from DB row). */
export interface ChannelRecord {
  id: string;
  userId: string;
  name: string;
  platform: ChannelPlatform;
  capability: ChannelCapability;
  config: unknown;
  isActive: boolean;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

export interface ChannelAdapter {
  /** Which platform this adapter handles. */
  readonly platform: ChannelPlatform;

  /** Supported capabilities for this platform. */
  readonly capabilities: readonly ChannelCapability[];

  /**
   * Validate raw config input and encrypt secrets.
   * Throws on validation failure.
   * Returns config ready for DB storage.
   */
  validateAndEncryptConfig(rawConfig: unknown): Promise<Record<string, unknown>>;

  /**
   * Decrypt stored config for runtime use.
   * Returns null on failure.
   */
  decryptConfig(storedConfig: unknown): Record<string, unknown> | null;

  /**
   * Send a message through this channel.
   */
  send(
    channel: ChannelRecord,
    message: string,
    options?: Record<string, unknown>,
  ): Promise<SendResult>;

  /**
   * Start a persistent runtime for this channel (e.g., polling bot).
   * Optional — outbound-only adapters can omit.
   */
  start?(channel: ChannelRecord): Promise<void>;

  /** Stop runtime for a specific channel. */
  stop?(channelId: string): Promise<void>;

  /** Start all active channels of this platform. Called at app startup. */
  startAll?(): Promise<void>;

  /** Stop all running channels. Called at app shutdown. */
  stopAll?(): Promise<void>;
}
