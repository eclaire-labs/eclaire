import { describe, expect, it } from "vitest";

import { convertMarkdownToMrkdwn } from "../message-utils.js";

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
