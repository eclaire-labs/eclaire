import { describe, expect, it } from "vitest";
import { splitMessage } from "../message-utils.js";

describe("splitMessage", () => {
  it("returns single chunk for short messages", () => {
    expect(splitMessage("Hello world")).toEqual(["Hello world"]);
  });

  it("returns empty array for empty string", () => {
    expect(splitMessage("")).toEqual([]);
  });

  it("returns single chunk for exactly maxLength", () => {
    const text = "a".repeat(1900);
    expect(splitMessage(text)).toEqual([text]);
  });

  it("splits at paragraph boundaries", () => {
    const p1 = "a".repeat(1200);
    const p2 = "b".repeat(1200);
    const text = `${p1}\n\n${p2}`;
    const chunks = splitMessage(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(p1);
    expect(chunks[1]).toBe(p2);
  });

  it("splits at line boundaries when no paragraph breaks", () => {
    const l1 = "a".repeat(1200);
    const l2 = "b".repeat(1200);
    const text = `${l1}\n${l2}`;
    const chunks = splitMessage(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(l1);
    expect(chunks[1]).toBe(l2);
  });

  it("splits at sentence boundaries as fallback", () => {
    const s1 = "a".repeat(1200);
    const s2 = "b".repeat(1200);
    const text = `${s1}. ${s2}`;
    const chunks = splitMessage(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(`${s1}.`);
    expect(chunks[1]).toBe(s2);
  });

  it("splits at word boundaries as fallback", () => {
    const w1 = "a".repeat(1200);
    const w2 = "b".repeat(1200);
    const text = `${w1} ${w2}`;
    const chunks = splitMessage(text);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(w1);
    expect(chunks[1]).toBe(w2);
  });

  it("hard splits when no boundaries available", () => {
    const text = "a".repeat(5000);
    const chunks = splitMessage(text);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe("a".repeat(1900));
    expect(chunks[1]).toBe("a".repeat(1900));
    expect(chunks[2]).toBe("a".repeat(1200));
  });

  it("respects custom maxLength", () => {
    const text = "a".repeat(200);
    const chunks = splitMessage(text, 100);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe("a".repeat(100));
    expect(chunks[1]).toBe("a".repeat(100));
  });

  it("does not split below 30% threshold", () => {
    // Place a paragraph boundary very early (at 10%), which is below the 30% threshold
    const text = `${"a".repeat(100)}\n\n${"b".repeat(2000)}`;
    const chunks = splitMessage(text);
    // Should NOT split at the early paragraph boundary — falls through to hard split
    expect(chunks[0]!.length).toBeGreaterThan(100);
  });
});
