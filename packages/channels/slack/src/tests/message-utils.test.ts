import { describe, it, expect } from "vitest";
import { splitMessage, convertMarkdownToMrkdwn } from "../message-utils.js";

describe("splitMessage", () => {
  it("returns empty array for empty string", () => {
    expect(splitMessage("")).toEqual([]);
  });

  it("returns single chunk for short message", () => {
    const msg = "Hello, world!";
    expect(splitMessage(msg)).toEqual([msg]);
  });

  it("splits long messages at paragraph boundaries", () => {
    const paragraph1 = "A".repeat(3800);
    const paragraph2 = "B".repeat(200);
    const msg = `${paragraph1}\n\n${paragraph2}`;

    const chunks = splitMessage(msg);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe(paragraph1);
    expect(chunks[1]).toBe(paragraph2);
  });

  it("splits at line boundary when no paragraph break", () => {
    const line1 = "A".repeat(3800);
    const line2 = "B".repeat(200);
    const msg = `${line1}\n${line2}`;

    const chunks = splitMessage(msg);
    expect(chunks.length).toBe(2);
  });

  it("respects custom max length", () => {
    const msg = "ABCDE FGHIJ KLMNO";
    const chunks = splitMessage(msg, 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10);
    }
  });
});

describe("convertMarkdownToMrkdwn", () => {
  it("converts bold syntax", () => {
    expect(convertMarkdownToMrkdwn("**hello**")).toBe("*hello*");
  });

  it("converts links", () => {
    expect(convertMarkdownToMrkdwn("[click here](https://example.com)")).toBe(
      "<https://example.com|click here>",
    );
  });

  it("converts strikethrough", () => {
    expect(convertMarkdownToMrkdwn("~~deleted~~")).toBe("~deleted~");
  });

  it("preserves code blocks", () => {
    expect(convertMarkdownToMrkdwn("`code`")).toBe("`code`");
    expect(convertMarkdownToMrkdwn("```\ncode\n```")).toBe("```\ncode\n```");
  });

  it("handles mixed formatting", () => {
    const input = "**Bold** and [link](https://example.com) and ~~strike~~";
    const expected = "*Bold* and <https://example.com|link> and ~strike~";
    expect(convertMarkdownToMrkdwn(input)).toBe(expected);
  });

  it("leaves plain text unchanged", () => {
    expect(convertMarkdownToMrkdwn("plain text")).toBe("plain text");
  });

  it("escapes ampersands", () => {
    expect(convertMarkdownToMrkdwn("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapes angle brackets to prevent mrkdwn injection", () => {
    expect(convertMarkdownToMrkdwn("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;",
    );
  });

  it("preserves link angle brackets while escaping others", () => {
    const input = "Check [here](https://example.com) and <not a tag>";
    const result = convertMarkdownToMrkdwn(input);
    expect(result).toContain("<https://example.com|here>");
    expect(result).toContain("&lt;not a tag&gt;");
  });

  it("escapes ampersands in URLs within links", () => {
    const input = "[search](https://example.com?a=1&b=2)";
    const result = convertMarkdownToMrkdwn(input);
    expect(result).toBe("<https://example.com?a=1&amp;b=2|search>");
  });
});
