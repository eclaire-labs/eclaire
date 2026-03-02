import { describe, expect, it } from "vitest";
import { buildObjectMetadata, noopLogger } from "../../core/types.js";

describe("buildObjectMetadata", () => {
  it("builds metadata with size and content type", () => {
    const metadata = buildObjectMetadata(1024, {
      contentType: "application/pdf",
    });

    expect(metadata.contentType).toBe("application/pdf");
    expect(metadata.size).toBe(1024);
    expect(metadata.createdAt).toBeInstanceOf(Date);
    expect(metadata.updatedAt).toBeInstanceOf(Date);
    expect(metadata.custom).toBeUndefined();
  });

  it("includes custom metadata when provided", () => {
    const metadata = buildObjectMetadata(100, {
      contentType: "text/plain",
      custom: { originalFilename: "doc.txt", source: "upload" },
    });

    expect(metadata.custom).toEqual({
      originalFilename: "doc.txt",
      source: "upload",
    });
  });

  it("sets createdAt and updatedAt to the same time", () => {
    const metadata = buildObjectMetadata(0, { contentType: "text/plain" });
    expect(metadata.createdAt.getTime()).toBe(metadata.updatedAt.getTime());
  });
});

describe("noopLogger", () => {
  it("does not throw when called", () => {
    expect(() => noopLogger.debug({}, "msg")).not.toThrow();
    expect(() => noopLogger.info({}, "msg")).not.toThrow();
    expect(() => noopLogger.warn({}, "msg")).not.toThrow();
    expect(() => noopLogger.error({}, "msg")).not.toThrow();
  });
});
