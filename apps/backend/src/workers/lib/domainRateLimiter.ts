import { createChildLogger } from "../../lib/logger.js";
import { updateProcessingJobStatus } from "../../lib/services/processing-status.js";
import { config } from "../config.js";

const logger = createChildLogger("domain-rate-limiter");

/** Error categories for graduated failure tracking */
export type DomainErrorCategory =
  | "server_error" // 5xx responses
  | "network_error" // DNS, TLS, connection failures
  | "client_error" // 4xx responses (should not trigger blocking)
  | "processing_error"; // sharp, storage, content extraction failures (should not trigger blocking)

interface DomainFailure {
  category: DomainErrorCategory;
  message: string;
  timestamp: number;
}

/** Categories that count toward domain blocking when they occur consecutively */
const BLOCKABLE_CATEGORIES: ReadonlySet<DomainErrorCategory> = new Set([
  "server_error",
  "network_error",
]);

/** Number of consecutive blockable failures before blocking a domain */
const BLOCK_THRESHOLD = 3;

/** Time window for consecutive failures (10 minutes) */
const FAILURE_WINDOW_MS = 10 * 60 * 1000;

interface DomainState {
  lastProcessedAt: number;
  currentlyRunning: Set<string>; // job IDs
  blockedUntil?: number; // Timestamp when domain can be retried again
  blockedReason?: string;
  blockedAt?: number;
  recentFailures: DomainFailure[]; // Tracks failures within the time window
}

interface DomainRule {
  delaySeconds: number;
  maxConcurrent: number;
  handler?: string;
}

export class DomainRateLimiter {
  private domainStates = new Map<string, DomainState>();
  private lastGlobalRequestAt = 0; // Track last request across all domains

  /**
   * Check if a domain can be processed now
   */
  checkDomainAvailability(
    url: string,
    handler?: string,
  ): {
    canProcess: boolean;
    delayMs: number;
    domain: string;
    rule: DomainRule;
    blocked?: boolean;
    blockedReason?: string;
  } {
    const domain = this.extractDomain(url);
    const rule = this.getDomainRule(domain, handler);
    const state = this.getDomainState(domain);

    // Check if domain is temporarily blocked due to errors
    const now = Date.now();
    if (state.blockedUntil && now < state.blockedUntil) {
      const remainingBlockTimeMs = state.blockedUntil - now;
      logger.warn(
        {
          domain,
          blockedReason: state.blockedReason,
          blockedAt: state.blockedAt ? new Date(state.blockedAt) : undefined,
          blockedUntil: new Date(state.blockedUntil),
          remainingBlockTimeMs,
        },
        "Domain is temporarily blocked due to errors",
      );

      return {
        canProcess: false,
        delayMs: remainingBlockTimeMs,
        domain,
        rule,
        blocked: true,
        blockedReason: state.blockedReason,
      };
    }

    // Clear expired block
    if (state.blockedUntil && now >= state.blockedUntil) {
      logger.info(
        {
          domain,
          previousBlockReason: state.blockedReason,
        },
        "Domain block expired, allowing retries",
      );
      state.blockedUntil = undefined;
      state.blockedReason = undefined;
      state.blockedAt = undefined;
    }

    // Check concurrency limit
    if (state.currentlyRunning.size >= rule.maxConcurrent) {
      logger.debug(
        {
          domain,
          running: state.currentlyRunning.size,
          maxConcurrent: rule.maxConcurrent,
        },
        "Domain at max concurrency",
      );

      return {
        canProcess: false,
        delayMs: 5000, // Check again in 5 seconds
        domain,
        rule,
      };
    }

    // Check inter-domain delay first (global rate limiting)
    const timeSinceLastGlobalMs = now - this.lastGlobalRequestAt;
    const interDomainDelayMs = config.domains.interDomainDelayMs || 0;

    if (
      this.lastGlobalRequestAt > 0 &&
      timeSinceLastGlobalMs < interDomainDelayMs
    ) {
      const remainingInterDomainDelayMs =
        interDomainDelayMs - timeSinceLastGlobalMs;

      logger.debug(
        {
          domain,
          timeSinceLastGlobalMs,
          interDomainDelayMs,
          remainingInterDomainDelayMs,
        },
        "Inter-domain rate limited",
      );

      return {
        canProcess: false,
        delayMs: remainingInterDomainDelayMs,
        domain,
        rule,
      };
    }

    // Check same-domain rate limit
    const timeSinceLastMs = now - state.lastProcessedAt;
    const requiredDelayMs = rule.delaySeconds * 1000;

    if (state.lastProcessedAt > 0 && timeSinceLastMs < requiredDelayMs) {
      const remainingDelayMs = requiredDelayMs - timeSinceLastMs;

      logger.debug(
        {
          domain,
          timeSinceLastMs,
          requiredDelayMs,
          remainingDelayMs,
        },
        "Same-domain rate limited",
      );

      return {
        canProcess: false,
        delayMs: remainingDelayMs,
        domain,
        rule,
      };
    }

    return {
      canProcess: true,
      delayMs: 0,
      domain,
      rule,
    };
  }

  /**
   * Mark domain as being processed
   */
  markDomainProcessing(url: string, jobId: string): void {
    const domain = this.extractDomain(url);
    const state = this.getDomainState(domain);
    const now = Date.now();

    state.currentlyRunning.add(jobId);
    state.lastProcessedAt = now;
    this.lastGlobalRequestAt = now; // Track global timing

    logger.debug(
      {
        domain,
        jobId,
        running: state.currentlyRunning.size,
      },
      "Marked domain as processing",
    );
  }

  /**
   * Mark domain processing as complete
   */
  markDomainComplete(url: string, jobId: string): void {
    const domain = this.extractDomain(url);
    const state = this.getDomainState(domain);

    state.currentlyRunning.delete(jobId);

    logger.debug(
      {
        domain,
        jobId,
        running: state.currentlyRunning.size,
      },
      "Marked domain as complete",
    );
  }

  /**
   * Record a job failure for a domain. Uses graduated tracking:
   * - Only server_error and network_error count toward blocking
   * - client_error and processing_error are logged but never trigger blocking
   * - Domain is blocked only after BLOCK_THRESHOLD consecutive blockable failures within FAILURE_WINDOW_MS
   * Returns true if the domain was blocked as a result.
   */
  recordFailure(
    url: string,
    category: DomainErrorCategory,
    message: string,
    blockDurationMs: number = 60 * 60 * 1000,
  ): boolean {
    const domain = this.extractDomain(url);
    const state = this.getDomainState(domain);
    const now = Date.now();

    // Prune failures outside the time window
    state.recentFailures = state.recentFailures.filter(
      (f) => now - f.timestamp < FAILURE_WINDOW_MS,
    );

    // Record the failure
    state.recentFailures.push({ category, message, timestamp: now });

    // Non-blockable categories are recorded for stats but never trigger blocking
    if (!BLOCKABLE_CATEGORIES.has(category)) {
      logger.info(
        { domain, category, message },
        "Non-blockable failure recorded (will not trigger domain block)",
      );
      return false;
    }

    // Count consecutive blockable failures (from the end of the list)
    let consecutiveBlockable = 0;
    for (let i = state.recentFailures.length - 1; i >= 0; i--) {
      const failure = state.recentFailures[i];
      if (failure && BLOCKABLE_CATEGORIES.has(failure.category)) {
        consecutiveBlockable++;
      } else {
        break; // Non-blockable failure (or end of list) breaks the consecutive streak
      }
    }

    logger.info(
      {
        domain,
        category,
        consecutiveBlockable,
        threshold: BLOCK_THRESHOLD,
        message,
      },
      "Blockable failure recorded",
    );

    if (consecutiveBlockable >= BLOCK_THRESHOLD) {
      this.blockDomain(
        url,
        `${consecutiveBlockable} consecutive ${category} failures: ${message}`,
        blockDurationMs,
      );
      return true;
    }

    return false;
  }

  /**
   * Mark a domain as having completed a job successfully. Resets the failure counter.
   */
  markDomainSuccess(url: string): void {
    const domain = this.extractDomain(url);
    const state = this.getDomainState(domain);
    state.recentFailures = [];
  }

  /**
   * Block a domain due to errors - will automatically unblock after 1 hour
   */
  blockDomain(
    url: string,
    reason: string,
    blockDurationMs: number = 60 * 60 * 1000,
  ): void {
    const domain = this.extractDomain(url);
    const state = this.getDomainState(domain);
    const now = Date.now();

    state.blockedUntil = now + blockDurationMs;
    state.blockedReason = reason;
    state.blockedAt = now;
    // Clear running jobs when blocking
    state.currentlyRunning.clear();

    logger.error(
      {
        domain,
        reason,
        blockedAt: new Date(state.blockedAt),
        blockedUntil: new Date(state.blockedUntil),
        blockDurationHours: blockDurationMs / (60 * 60 * 1000),
      },
      "Domain temporarily blocked due to errors",
    );
  }

  /**
   * Manually unblock a domain (for admin intervention)
   */
  unblockDomain(url: string): boolean {
    const domain = this.extractDomain(url);
    const state = this.domainStates.get(domain);

    if (!state || !state.blockedUntil) {
      return false;
    }

    state.blockedUntil = undefined;
    state.blockedReason = undefined;
    state.blockedAt = undefined;

    logger.info({ domain }, "Domain manually unblocked");
    return true;
  }

  /**
   * Get current stats (useful for monitoring/debugging)
   */
  getStats(): Record<
    string,
    {
      running: number;
      lastProcessed: Date | null;
      isBlocked: boolean;
      blockedReason?: string;
      blockedAt?: Date;
      blockedUntil?: Date;
    }
  > {
    const stats: Record<
      string,
      {
        running: number;
        lastProcessed: Date | null;
        isBlocked: boolean;
        blockedReason?: string;
        blockedAt?: Date;
        blockedUntil?: Date;
      }
    > = {};

    for (const [domain, state] of this.domainStates.entries()) {
      stats[domain] = {
        running: state.currentlyRunning.size,
        lastProcessed:
          state.lastProcessedAt > 0 ? new Date(state.lastProcessedAt) : null,
        isBlocked: state.blockedUntil ? Date.now() < state.blockedUntil : false,
        blockedReason: state.blockedReason,
        blockedAt: state.blockedAt ? new Date(state.blockedAt) : undefined,
        blockedUntil: state.blockedUntil
          ? new Date(state.blockedUntil)
          : undefined,
      };
    }

    return stats;
  }

  /**
   * Get list of currently blocked domains
   */
  getBlockedDomains(): string[] {
    const blocked: string[] = [];
    const now = Date.now();
    for (const [domain, state] of this.domainStates.entries()) {
      if (state.blockedUntil && now < state.blockedUntil) {
        blocked.push(domain);
      }
    }
    return blocked;
  }

  /**
   * Cleanup stale job references (call periodically)
   */
  cleanup(
    onStaleJobDetected?: (
      jobId: string,
      domain: string,
      staleTimeMs: number,
    ) => Promise<void>,
  ): void {
    const now = Date.now();
    const maxJobTime = 10 * 60 * 1000; // 10 minutes

    for (const [domain, state] of this.domainStates.entries()) {
      // If no jobs have completed in max job time, clear running jobs
      // (handles crashed/stuck jobs)
      if (
        state.currentlyRunning.size > 0 &&
        now - state.lastProcessedAt > maxJobTime
      ) {
        const staleTimeMs = now - state.lastProcessedAt;
        const staleJobIds = Array.from(state.currentlyRunning);

        logger.warn(
          {
            domain,
            runningJobs: staleJobIds,
            staleTimeMs,
            maxJobTimeMs: maxJobTime,
          },
          "Clearing stale running jobs",
        );

        // Notify about each stale job if callback provided
        if (onStaleJobDetected) {
          for (const jobId of staleJobIds) {
            // Fire and forget - don't block cleanup on failing jobs
            onStaleJobDetected(jobId, domain, staleTimeMs).catch((error) => {
              logger.error(
                { jobId, domain, error: error.message },
                "Failed to handle stale job detection",
              );
            });
          }
        }

        state.currentlyRunning.clear();
      }
    }
  }

  private getDomainState(domain: string): DomainState {
    if (!this.domainStates.has(domain)) {
      this.domainStates.set(domain, {
        lastProcessedAt: 0,
        currentlyRunning: new Set<string>(),
        recentFailures: [],
      });
    }
    // biome-ignore lint/style/noNonNullAssertion: guarded by .has() check and .set() above
    return this.domainStates.get(domain)!;
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
      return urlObj.hostname.toLowerCase();
    } catch {
      return "unknown";
    }
  }

  private getDomainRule(domain: string, handler?: string): DomainRule {
    // Check exact match
    const domainConfig = config.domains.rules[domain];
    if (domainConfig) {
      // Check for handler-specific rule first
      if (handler && domainConfig[handler]) {
        const handlerRule = domainConfig[handler];
        if (
          handlerRule.delaySeconds !== undefined &&
          handlerRule.maxConcurrent !== undefined
        ) {
          logger.debug(
            { domain, handler, rule: handlerRule },
            "Using handler-specific rate limit rule",
          );
          return {
            delaySeconds: handlerRule.delaySeconds,
            maxConcurrent: handlerRule.maxConcurrent,
            handler,
          };
        }
      }

      // Fall back to domain-level rule
      if (
        domainConfig.delaySeconds !== undefined &&
        domainConfig.maxConcurrent !== undefined
      ) {
        logger.debug(
          { domain, rule: domainConfig },
          "Using domain-level rate limit rule",
        );
        return {
          delaySeconds: domainConfig.delaySeconds,
          maxConcurrent: domainConfig.maxConcurrent,
          handler: domainConfig.handler,
        };
      }
    }

    // Check wildcard matches
    for (const [ruleDomain, rule] of Object.entries(config.domains.rules)) {
      if (ruleDomain.startsWith("*.")) {
        const baseDomain = ruleDomain.substring(2);
        if (domain.endsWith(baseDomain)) {
          // Check for handler-specific rule in wildcard match
          if (handler && rule[handler]) {
            const handlerRule = rule[handler];
            if (
              handlerRule.delaySeconds !== undefined &&
              handlerRule.maxConcurrent !== undefined
            ) {
              return {
                delaySeconds: handlerRule.delaySeconds,
                maxConcurrent: handlerRule.maxConcurrent,
                handler,
              };
            }
          }

          // Fall back to wildcard domain rule
          if (
            rule.delaySeconds !== undefined &&
            rule.maxConcurrent !== undefined
          ) {
            return {
              delaySeconds: rule.delaySeconds,
              maxConcurrent: rule.maxConcurrent,
              handler: rule.handler,
            };
          }
        }
      }
    }

    logger.debug({ domain, handler }, "Using default rate limit rule");
    return config.domains.defaultRateLimit;
  }
}

// Singleton instance
export const domainRateLimiter = new DomainRateLimiter();

/**
 * Handle stale job detection by properly failing the stuck jobs
 */
async function handleStaleJob(
  jobId: string,
  domain: string,
  staleTimeMs: number,
): Promise<void> {
  try {
    // Update the database state for the stale job
    const dbErrorMessage = `Job timed out after ${Math.round(staleTimeMs / 1000)}s during processing (domain: ${domain})`;
    await updateProcessingJobStatus(
      "bookmarks",
      jobId,
      "failed",
      undefined, // stage
      undefined, // progress
      dbErrorMessage,
      {
        failureType: "processing_timeout",
        domain,
        staleTimeMs,
        timeoutType: "domain_rate_limiter_cleanup",
      },
    );

    logger.info(
      { jobId, domain, staleTimeMs },
      "Successfully updated database state for stale job via domain rate limiter cleanup",
    );
  } catch (error: unknown) {
    logger.error(
      {
        jobId,
        domain,
        error: error instanceof Error ? error.message : String(error),
      },
      "Failed to fail stale job during cleanup",
    );
  }
}

// Cleanup stale jobs every 5 minutes
setInterval(
  () => {
    domainRateLimiter.cleanup(handleStaleJob);
  },
  5 * 60 * 1000,
);
