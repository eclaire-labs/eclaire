/**
 * Error utility for extracting human-readable messages from unknown errors.
 * Inlined to avoid external dependencies.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error ?? "Unknown error");
}
