import { createRetry } from "@eclaire/channels-core";

/**
 * Extracts `retry_after` seconds from a Telegraf TelegramError (429 response).
 */
function getRetryAfterMs(err: unknown): number | null {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    err.response &&
    typeof err.response === "object" &&
    "parameters" in err.response &&
    err.response.parameters &&
    typeof err.response.parameters === "object" &&
    "retry_after" in err.response.parameters &&
    typeof err.response.parameters.retry_after === "number"
  ) {
    return err.response.parameters.retry_after * 1000;
  }
  return null;
}

/** Extracts the HTTP error code from a Telegraf TelegramError, if present. */
export function getErrorCode(err: unknown): number | null {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    err.response &&
    typeof err.response === "object" &&
    "error_code" in err.response &&
    typeof err.response.error_code === "number"
  ) {
    return err.response.error_code;
  }
  return null;
}

export const { withRetry, isRecoverableError } = createRetry({
  // Telegram 429 Too Many Requests
  isRecoverable: (err) => getErrorCode(err) === 429,
  getRetryAfterMs,
});
