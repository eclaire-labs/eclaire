/**
 * Hard timeout utility using Promise.race to enforce true timeout cancellation
 */

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Wraps a promise with a hard timeout using Promise.race.
 * This ensures that the operation will be cancelled even if the underlying
 * async operation doesn't respect its own timeout settings.
 *
 * @param promise The promise to wrap with a timeout
 * @param timeoutMs Timeout in milliseconds
 * @param operation Description of the operation for error messages
 * @returns Promise that resolves with the original promise result or rejects with TimeoutError
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string = "operation",
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    const timeoutId = setTimeout(() => {
      clearTimeout(timeoutId);
      reject(
        new TimeoutError(
          `${operation} timed out after ${timeoutMs}ms`,
          operation,
          timeoutMs,
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Default timeout values for different browser operations
 */
export const DEFAULT_TIMEOUTS = {
  BROWSER_CONTEXT: 30000, // 30 seconds
  PAGE_NAVIGATION: 65000, // 65 seconds (slightly longer than Playwright's 60s)
  SCREENSHOT_DESKTOP: 35000, // 35 seconds (slightly longer than Playwright's 30s)
  SCREENSHOT_FULLPAGE: 50000, // 50 seconds (slightly longer than Playwright's 45s)
  SCREENSHOT_MOBILE: 35000, // 35 seconds
  PDF_GENERATION: 90000, // 90 seconds for PDF generation
} as const;
