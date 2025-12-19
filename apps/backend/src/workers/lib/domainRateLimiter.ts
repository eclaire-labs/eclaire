import { config } from "../config.js";
import { getQueue } from "../queues.js";
import { QueueNames } from "@eclaire/queue/app";
import { createChildLogger } from "../../lib/logger.js";
import { updateProcessingJobStatus } from "../../lib/services/processing-status.js";

const logger = createChildLogger("domain-rate-limiter");

interface DomainState {
  lastProcessedAt: number;
  currentlyRunning: Set<string>; // job IDs
  blockedUntil?: number; // Timestamp when domain can be retried again
  blockedReason?: string;
  blockedAt?: number;
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
      });
    }
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
    // First, try to find and fail the job in BullMQ (only in Redis mode)
    const bookmarkQueue = getQueue(QueueNames.BOOKMARK_PROCESSING);
    if (!bookmarkQueue) {
      logger.warn(
        { jobId, domain },
        "Stale job cleanup skipped: not in Redis mode",
      );
      return;
    }

    const job = await bookmarkQueue.getJob(jobId);

    if (job && (await job.isActive())) {
      const errorMessage = `Job timed out after ${Math.round(staleTimeMs / 1000)}s and was cleaned up by the rate limiter (domain: ${domain})`;

      // Use the job's own methods to fail it in BullMQ
      await job.moveToFailed(new Error(errorMessage), "stale_job_cleanup");

      logger.info(
        { jobId, domain, staleTimeMs },
        "Successfully failed stale job in BullMQ via domain rate limiter cleanup",
      );
    } else {
      logger.warn(
        { jobId, domain },
        "Stale job detected but could not be found or was not active in BullMQ",
      );
    }

    // Also update the database state for consistency
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
  } catch (error: any) {
    logger.error(
      { jobId, domain, error: error.message },
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
