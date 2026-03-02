import { describe, expect, it } from "vitest";
import {
  StorageAccessDeniedError,
  StorageError,
  StorageInvalidKeyError,
  StorageNotFoundError,
  StorageQuotaExceededError,
} from "../../core/errors.js";

describe("StorageError", () => {
  it("has the correct name", () => {
    const error = new StorageError("test");
    expect(error.name).toBe("StorageError");
  });

  it("extends Error", () => {
    const error = new StorageError("test");
    expect(error).toBeInstanceOf(Error);
  });
});

describe("StorageNotFoundError", () => {
  it("has the correct name", () => {
    const error = new StorageNotFoundError("my-key");
    expect(error.name).toBe("StorageNotFoundError");
  });

  it("exposes the key", () => {
    const error = new StorageNotFoundError("user-1/docs/doc-1/file.txt");
    expect(error.key).toBe("user-1/docs/doc-1/file.txt");
  });

  it("includes the key in the message", () => {
    const error = new StorageNotFoundError("my-key");
    expect(error.message).toContain("my-key");
  });

  it("is instanceof StorageError", () => {
    const error = new StorageNotFoundError("k");
    expect(error).toBeInstanceOf(StorageError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe("StorageAccessDeniedError", () => {
  it("has the correct name", () => {
    const error = new StorageAccessDeniedError("my-key");
    expect(error.name).toBe("StorageAccessDeniedError");
  });

  it("exposes the key", () => {
    const error = new StorageAccessDeniedError("my-key");
    expect(error.key).toBe("my-key");
  });

  it("uses a custom message when provided", () => {
    const error = new StorageAccessDeniedError("k", "custom reason");
    expect(error.message).toBe("custom reason");
  });

  it("uses a default message when none provided", () => {
    const error = new StorageAccessDeniedError("my-key");
    expect(error.message).toContain("my-key");
  });

  it("is instanceof StorageError", () => {
    const error = new StorageAccessDeniedError("k");
    expect(error).toBeInstanceOf(StorageError);
  });
});

describe("StorageQuotaExceededError", () => {
  it("has the correct name", () => {
    const error = new StorageQuotaExceededError();
    expect(error.name).toBe("StorageQuotaExceededError");
  });

  it("uses a default message", () => {
    const error = new StorageQuotaExceededError();
    expect(error.message).toBe("Storage quota exceeded");
  });

  it("accepts a custom message", () => {
    const error = new StorageQuotaExceededError("over 5GB");
    expect(error.message).toBe("over 5GB");
  });

  it("is instanceof StorageError", () => {
    const error = new StorageQuotaExceededError();
    expect(error).toBeInstanceOf(StorageError);
  });
});

describe("StorageInvalidKeyError", () => {
  it("has the correct name", () => {
    const error = new StorageInvalidKeyError("../evil");
    expect(error.name).toBe("StorageInvalidKeyError");
  });

  it("exposes the key", () => {
    const error = new StorageInvalidKeyError("../evil");
    expect(error.key).toBe("../evil");
  });

  it("uses a default message when none provided", () => {
    const error = new StorageInvalidKeyError("../evil");
    expect(error.message).toContain("../evil");
  });

  it("uses a custom message when provided", () => {
    const error = new StorageInvalidKeyError("k", "path traversal");
    expect(error.message).toBe("path traversal");
  });

  it("is instanceof StorageError", () => {
    const error = new StorageInvalidKeyError("k");
    expect(error).toBeInstanceOf(StorageError);
  });
});
