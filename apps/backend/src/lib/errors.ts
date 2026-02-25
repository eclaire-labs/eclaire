export class ValidationError extends Error {
  public readonly name = "ValidationError";
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationError);
    }
  }
}

export class NotFoundError extends Error {
  public readonly name = "NotFoundError";
  public readonly resource: string;

  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`);
    this.resource = resource;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError);
    }
  }
}

export class ForbiddenError extends Error {
  public readonly name = "ForbiddenError";

  constructor(message = "Forbidden") {
    super(message);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ForbiddenError);
    }
  }
}
