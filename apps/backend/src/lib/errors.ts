export class ValidationError extends Error {
  public readonly name = "ValidationError";
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;

    // Maintains proper stack trace for where error was thrown (Node.js only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}
