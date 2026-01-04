/**
 * Text Parser Tests
 *
 * Tests for text-based content parsing with thinking and tool calls.
 */

import { describe, expect, it } from "vitest";
import {
  extractThinkingContent,
  parseTextToolContent,
  extractFinalResponse,
  extractToolCalls,
} from "../text-parser.js";

describe("Text Parser", () => {
  describe("extractThinkingContent", () => {
    it("extracts think tags and returns cleaned content", () => {
      const content = "<think>I need to think about this</think>Here is my response";
      const result = extractThinkingContent(content);

      expect(result.thinkingContent).toBe("I need to think about this");
      expect(result.cleanedContent).toBe("Here is my response");
    });

    it("returns null when no think tags present", () => {
      const content = "Hello, this is my response without thinking.";
      const result = extractThinkingContent(content);

      expect(result.thinkingContent).toBeNull();
      expect(result.cleanedContent).toBe("Hello, this is my response without thinking.");
    });

    it("handles think tags with whitespace", () => {
      const content = "<think>   Thinking with spaces   </think>   Response  ";
      const result = extractThinkingContent(content);

      expect(result.thinkingContent).toBe("Thinking with spaces");
      expect(result.cleanedContent).toBe("Response");
    });

    it("handles multiline think content", () => {
      const content = `<think>
First thought
Second thought
Third thought
</think>
My final response`;
      const result = extractThinkingContent(content);

      expect(result.thinkingContent).toContain("First thought");
      expect(result.thinkingContent).toContain("Third thought");
      expect(result.cleanedContent).toBe("My final response");
    });

    it("is case insensitive for think tags", () => {
      const content = "<THINK>Uppercase thinking</THINK>Response";
      const result = extractThinkingContent(content);

      expect(result.thinkingContent).toBe("Uppercase thinking");
      expect(result.cleanedContent).toBe("Response");
    });

    it("handles empty think tags", () => {
      const content = "<think></think>Response";
      const result = extractThinkingContent(content);

      // Empty think tags don't match the regex (requires content), so content is unchanged
      expect(result.thinkingContent).toBeNull();
      expect(result.cleanedContent).toBe("<think></think>Response");
    });

    it("handles think tags with only whitespace", () => {
      const content = "<think>   </think>Response";
      const result = extractThinkingContent(content);

      // The \s* in regex consumes the whitespace, leaving empty capture group
      // Empty capture group is falsy, so tags are not removed from content
      expect(result.thinkingContent).toBeNull();
      expect(result.cleanedContent).toBe("<think>   </think>Response");
    });

    it("handles think tags with actual content", () => {
      const content = "<think>x</think>Response";
      const result = extractThinkingContent(content);

      expect(result.thinkingContent).toBe("x");
      expect(result.cleanedContent).toBe("Response");
    });
  });

  describe("parseTextToolContent", () => {
    it("uses reasoning field as thinking source", () => {
      const content = "Here is my response";
      const reasoning = "I thought about this carefully";
      const result = parseTextToolContent(content, reasoning);

      expect(result.thinkingContent).toBe("I thought about this carefully");
      expect(result.thinkingSource).toBe("reasoning_field");
      expect(result.textResponse).toBe("Here is my response");
    });

    it("falls back to embedded tags when no reasoning", () => {
      const content = "<think>Embedded thinking</think>My response";
      const result = parseTextToolContent(content);

      expect(result.thinkingContent).toBe("Embedded thinking");
      expect(result.thinkingSource).toBe("embedded_tags");
      expect(result.textResponse).toBe("My response");
    });

    it("reasoning field takes precedence over embedded tags", () => {
      const content = "<think>Embedded thinking</think>My response";
      const reasoning = "Reasoning field value";
      const result = parseTextToolContent(content, reasoning);

      // Reasoning field wins
      expect(result.thinkingContent).toBe("Reasoning field value");
      expect(result.thinkingSource).toBe("reasoning_field");
      // Content still has <think> removed
      expect(result.textResponse).toBe("My response");
    });

    it("extracts JSON code block tool calls", () => {
      const content = `I'll search for that.
\`\`\`json
{"type": "tool_calls", "calls": [{"name": "search", "args": {"query": "TypeScript"}}]}
\`\`\`
`;
      const result = parseTextToolContent(content);

      expect(result.hasToolCalls).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]!.functionName).toBe("search");
      expect(result.toolCalls![0]!.arguments).toEqual({ query: "TypeScript" });
    });

    it("extracts inline tool calls", () => {
      const content = `{"type": "tool_calls", "calls": [{"name": "createNote", "args": {"title": "Test"}}]}`;
      const result = parseTextToolContent(content);

      expect(result.hasToolCalls).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]!.functionName).toBe("createNote");
    });

    it("removes tool calls from text response", () => {
      const content = `Here is some text before.
\`\`\`json
{"type": "tool_calls", "calls": [{"name": "search", "args": {"query": "test"}}]}
\`\`\`
And some text after.`;
      const result = parseTextToolContent(content);

      expect(result.hasToolCalls).toBe(true);
      expect(result.textResponse).not.toContain("tool_calls");
      expect(result.textResponse).toContain("Here is some text before");
      expect(result.textResponse).toContain("And some text after");
    });

    it("handles empty content", () => {
      const result = parseTextToolContent("");

      expect(result.hasToolCalls).toBe(false);
      expect(result.toolCalls).toBeUndefined();
      expect(result.textResponse).toBeUndefined();
    });

    it("handles empty content with reasoning", () => {
      const result = parseTextToolContent("", "Some reasoning");

      expect(result.thinkingContent).toBe("Some reasoning");
      expect(result.thinkingSource).toBe("reasoning_field");
      expect(result.hasToolCalls).toBe(false);
    });

    it("handles multiple tool calls", () => {
      const content = `\`\`\`json
{"type": "tool_calls", "calls": [
  {"name": "search", "args": {"query": "first"}},
  {"name": "search", "args": {"query": "second"}}
]}
\`\`\``;
      const result = parseTextToolContent(content);

      expect(result.hasToolCalls).toBe(true);
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0]!.functionName).toBe("search");
      expect(result.toolCalls![1]!.functionName).toBe("search");
    });

    it("ignores non-tool-call JSON code blocks", () => {
      const content = `Here is some JSON:
\`\`\`json
{"name": "John", "age": 30}
\`\`\`
That's just data.`;
      const result = parseTextToolContent(content);

      expect(result.hasToolCalls).toBe(false);
      expect(result.textResponse).toContain("Here is some JSON");
    });
  });

  describe("extractFinalResponse", () => {
    it("returns textResponse from parse result", () => {
      const parseResult = parseTextToolContent("Hello world");
      const response = extractFinalResponse(parseResult);

      expect(response).toBe("Hello world");
    });

    it("returns null when no text response", () => {
      const parseResult = parseTextToolContent("");
      const response = extractFinalResponse(parseResult);

      expect(response).toBeNull();
    });

    it("returns text without tool calls", () => {
      const content = `Some text
\`\`\`json
{"type": "tool_calls", "calls": [{"name": "test", "args": {}}]}
\`\`\``;
      const parseResult = parseTextToolContent(content);
      const response = extractFinalResponse(parseResult);

      expect(response).toBe("Some text");
    });
  });

  describe("extractToolCalls", () => {
    it("returns tool calls array from parse result", () => {
      const content = `\`\`\`json
{"type": "tool_calls", "calls": [{"name": "search", "args": {"q": "test"}}]}
\`\`\``;
      const parseResult = parseTextToolContent(content);
      const toolCalls = extractToolCalls(parseResult);

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]!.functionName).toBe("search");
      expect(toolCalls[0]!.arguments).toEqual({ q: "test" });
    });

    it("returns empty array when no tool calls", () => {
      const parseResult = parseTextToolContent("Just text, no tools");
      const toolCalls = extractToolCalls(parseResult);

      expect(toolCalls).toEqual([]);
    });
  });
});
