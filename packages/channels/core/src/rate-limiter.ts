/**
 * Simple sliding-window rate limiter for incoming channel messages.
 * Prevents unbounded AI compute from message spam.
 */

interface RateLimitEntry {
  timestamps: number[];
}

export interface RateLimiterOptions {
  /** Maximum messages allowed per window. Default: 20 */
  maxMessages?: number;
  /** Window size in milliseconds. Default: 60_000 (1 minute) */
  windowMs?: number;
}

export class ChannelRateLimiter {
  private entries = new Map<string, RateLimitEntry>();
  private readonly maxMessages: number;
  private readonly windowMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.maxMessages = options.maxMessages ?? 20;
    this.windowMs = options.windowMs ?? 60_000;
  }

  /**
   * Check if a message should be allowed through.
   * Returns true if allowed, false if rate-limited.
   */
  allow(channelId: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.entries.get(channelId);
    if (!entry) {
      entry = { timestamps: [] };
      this.entries.set(channelId, entry);
    }

    // Remove expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxMessages) {
      return false;
    }

    entry.timestamps.push(now);
    return true;
  }

  /** Reset rate limit state for a channel (e.g., when channel is stopped). */
  reset(channelId: string): void {
    this.entries.delete(channelId);
  }

  /** Clear all tracked state. */
  clear(): void {
    this.entries.clear();
  }
}
