import { describe, expect, it } from "vitest";
import { splitMessage } from "../message-utils.js";

describe("splitMessage", () => {
  it("returns single chunk for short messages", () => {
    expect(splitMessage("hello")).toEqual(["hello"]);
  });

  it("returns single chunk for exactly max length", () => {
    const msg = "a".repeat(4000);
    expect(splitMessage(msg)).toEqual([msg]);
  });

  it("returns empty array for empty string", () => {
    expect(splitMessage("")).toEqual([]);
  });

  it("splits at paragraph boundaries", () => {
    const para1 = "a".repeat(2000);
    const para2 = "b".repeat(2000);
    const para3 = "c".repeat(2000);
    const msg = `${para1}\n\n${para2}\n\n${para3}`;

    const chunks = splitMessage(msg);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Each chunk should be <= 4000
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4000);
    }
    // Joined content should match original (minus whitespace trimming)
    expect(chunks.join("\n\n")).toContain(para1);
    expect(chunks.join("\n\n")).toContain(para3);
  });

  it("splits at line boundaries when no paragraphs", () => {
    const lines = Array.from(
      { length: 100 },
      (_, i) => `Line ${i}: ${"x".repeat(50)}`,
    );
    const msg = lines.join("\n");

    const chunks = splitMessage(msg);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4000);
    }
    // No chunk should end mid-line (unless a single line exceeds max)
    for (const chunk of chunks) {
      expect(chunk.endsWith("\n")).toBe(false); // trimEnd removes trailing newlines
    }
  });

  it("splits at sentence boundaries as fallback", () => {
    // One long paragraph with sentences
    const sentences = Array.from(
      { length: 80 },
      (_, i) => `Sentence ${i} with some content here`,
    );
    const msg = sentences.join(". ");

    const chunks = splitMessage(msg);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4000);
    }
  });

  it("hard splits when no boundaries available", () => {
    const msg = "a".repeat(10000); // No spaces, no newlines
    const chunks = splitMessage(msg);

    expect(chunks.length).toBe(3);
    expect(chunks[0]!.length).toBe(4000);
    expect(chunks[1]!.length).toBe(4000);
    expect(chunks[2]!.length).toBe(2000);
  });

  it("respects custom maxLength", () => {
    const msg = "word ".repeat(100);
    const chunks = splitMessage(msg, 50);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });
});
