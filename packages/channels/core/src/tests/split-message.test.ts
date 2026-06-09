import { describe, expect, it, vi } from "vitest";

import { sendInChunks, splitMessage } from "../split-message.js";

const MAX = 4000;

describe("splitMessage", () => {
  it("returns single chunk for short messages", () => {
    expect(splitMessage("hello", MAX)).toEqual(["hello"]);
  });

  it("returns single chunk for exactly max length", () => {
    const msg = "a".repeat(MAX);
    expect(splitMessage(msg, MAX)).toEqual([msg]);
  });

  it("returns empty array for empty string", () => {
    expect(splitMessage("", MAX)).toEqual([]);
  });

  it("splits at paragraph boundaries", () => {
    const para1 = "a".repeat(2000);
    const para2 = "b".repeat(2000);
    const para3 = "c".repeat(2000);
    const msg = `${para1}\n\n${para2}\n\n${para3}`;

    const chunks = splitMessage(msg, MAX);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Each chunk should be <= max
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX);
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

    const chunks = splitMessage(msg, MAX);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX);
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

    const chunks = splitMessage(msg, MAX);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX);
    }
  });

  it("hard splits when no boundaries available", () => {
    const msg = "a".repeat(10000); // No spaces, no newlines
    const chunks = splitMessage(msg, MAX);

    expect(chunks.length).toBe(3);
    expect(chunks[0]!.length).toBe(MAX);
    expect(chunks[1]!.length).toBe(MAX);
    expect(chunks[2]!.length).toBe(2000);
  });

  it("respects small max lengths", () => {
    const msg = "word ".repeat(100);
    const chunks = splitMessage(msg, 50);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(50);
    }
  });
});

describe("sendInChunks", () => {
  it("sends chunks in order", async () => {
    const sent: string[] = [];
    await sendInChunks(["one", "two", "three"], async (chunk) => {
      sent.push(chunk);
    });
    expect(sent).toEqual(["one", "two", "three"]);
  });

  it("does nothing for an empty chunk list", async () => {
    const send = vi.fn();
    await sendInChunks([], send);
    expect(send).not.toHaveBeenCalled();
  });

  it("delays between chunks but not after the last", async () => {
    vi.useFakeTimers();
    try {
      const sent: string[] = [];
      const promise = sendInChunks(
        ["a", "b"],
        async (chunk) => {
          sent.push(chunk);
        },
        100,
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(sent).toEqual(["a"]);
      await vi.advanceTimersByTimeAsync(100);
      expect(sent).toEqual(["a", "b"]);
      await promise;
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates send errors", async () => {
    await expect(
      sendInChunks(["a"], async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
