import { createRetry } from "@eclaire/channels-core";

/**
 * Non-recoverable Slack auth/permission errors that should never be retried.
 * Retrying these wastes time and can trigger rate limits.
 */
const NON_RECOVERABLE_AUTH_PATTERN =
  /account_inactive|invalid_auth|token_revoked|token_expired|not_authed|org_login_required|team_access_not_granted|missing_scope|cannot_find_service|invalid_token/i;

function isNonRecoverableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (NON_RECOVERABLE_AUTH_PATTERN.test(err.message)) return true;
  const code = (err as Error & { code?: string }).code;
  if (code && NON_RECOVERABLE_AUTH_PATTERN.test(code)) return true;
  return false;
}

/**
 * Extracts the retry_after delay (in ms) from a Slack rate limit error, if present.
 */
export function getRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null;

  // Slack Web API errors include retryAfter in the error data
  const slackError = err as Error & {
    data?: { retry_after?: number };
    code?: string;
  };
  if (
    slackError.code === "slack_webapi_rate_limited_error" ||
    slackError.code === "rate_limited"
  ) {
    const retryAfter = slackError.data?.retry_after;
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return retryAfter * 1000;
    }
    return 5000;
  }

  // Check error message for rate limiting
  if (
    err.message.toLowerCase().includes("rate_limited") ||
    err.message.toLowerCase().includes("ratelimited")
  ) {
    return 5000;
  }

  return null;
}

export const { withRetry, isRecoverableError } = createRetry({
  // Slack rate limit (the message check inside getRetryAfterMs covers
  // "rate_limited"/"ratelimited" strings as well)
  isRecoverable: (err) => getRetryAfterMs(err) !== null,
  isNonRecoverable: isNonRecoverableError,
  getRetryAfterMs,
});
