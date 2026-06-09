/**
 * Circuit breaker for non-critical, repeated platform calls (typing
 * indicators, reactions). After enough consecutive failures the key is
 * suspended and further calls become no-ops, to avoid spamming an API
 * that is rejecting us (missing permissions, revoked tokens).
 */

export interface CircuitBreakerConfig {
  /** Consecutive failures before a key is suspended. Default 10. */
  maxConsecutiveFailures?: number;
  /**
   * Which errors count toward suspension. Default: all errors.
   * (e.g. Telegram counts only 401s — token revocation protection.)
   */
  shouldCountFailure?: (err: unknown) => boolean;
}

interface CircuitState {
  consecutiveFailures: number;
  suspended: boolean;
}

export function createCircuitBreaker(config: CircuitBreakerConfig = {}): {
  /**
   * Runs `fn` unless the key is suspended. Resets the failure counter on
   * success, counts qualifying failures, and always swallows errors —
   * the wrapped calls are non-critical. `onSuspend` fires once, when the
   * failure threshold is crossed.
   */
  run(
    key: string,
    fn: () => Promise<unknown>,
    onSuspend?: (consecutiveFailures: number) => void,
  ): Promise<void>;
  /** Clears state for a key. Call when a channel/bot is stopped or restarted. */
  reset(key: string): void;
} {
  const maxConsecutiveFailures = config.maxConsecutiveFailures ?? 10;
  const shouldCountFailure = config.shouldCountFailure ?? (() => true);
  const states = new Map<string, CircuitState>();

  function getState(key: string): CircuitState {
    let state = states.get(key);
    if (!state) {
      state = { consecutiveFailures: 0, suspended: false };
      states.set(key, state);
    }
    return state;
  }

  return {
    async run(key, fn, onSuspend) {
      const state = getState(key);

      if (state.suspended) {
        return;
      }

      try {
        await fn();
        state.consecutiveFailures = 0;
      } catch (err) {
        if (shouldCountFailure(err)) {
          state.consecutiveFailures++;
          if (state.consecutiveFailures >= maxConsecutiveFailures) {
            state.suspended = true;
            onSuspend?.(state.consecutiveFailures);
          }
        }
        // Swallow the error — the wrapped call is non-critical
      }
    },
    reset(key) {
      states.delete(key);
    },
  };
}
