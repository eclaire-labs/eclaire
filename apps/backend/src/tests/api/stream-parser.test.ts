import { beforeEach, describe, expect, it } from "vitest";
import { LLMStreamParser } from "@eclaire/ai";

describe("LLMStreamParser Character Preservation", () => {
  let parser: LLMStreamParser;

  beforeEach(() => {
    parser = new LLMStreamParser();
  });

  it("should preserve the first character when processing simple content", () => {
    const testContent = "You have the following tasks:";
    const results = parser.processContent(testContent);

    // Should have exactly one content result
    expect(results).toHaveLength(1);
    expect(results[0]).toBeDefined();
    expect(results[0]!.type).toBe("content");
    expect(results[0]!.content).toBe(testContent);

    // Verify the first character is preserved
    expect(results[0]!.content?.[0]).toBe("Y");
  });

  it("should preserve the first character when processing SSE delta content", () => {
    const sseData =
      'data: {"choices":[{"delta":{"content":"You are an assistant"}}]}';
    const sseResult = parser.parseSSELine(sseData);

    expect(sseResult).not.toBeNull();
    expect(sseResult?.type).toBe("content");
    expect(sseResult?.content).toBe("You are an assistant");
    expect(sseResult?.content?.[0]).toBe("Y");
  });

  it("should preserve the first character across multiple content chunks", () => {
    const chunks = ["You", " have", " tasks"];
    const allResults: any[] = [];

    for (const chunk of chunks) {
      const results = parser.processContent(chunk);
      allResults.push(...results);
    }

    // Combine all content results
    const combinedContent = allResults
      .filter((r) => r.type === "content")
      .map((r) => r.content)
      .join("");

    expect(combinedContent).toBe("You have tasks");
    expect(combinedContent[0]).toBe("Y");
  });

  it("should handle character-by-character streaming without losing first character", () => {
    const fullText = "You have the following tasks";
    const results: any[] = [];

    // Process character by character to simulate streaming
    for (let i = 0; i < fullText.length; i++) {
      const chunk = fullText[i];
      expect(chunk).toBeDefined();
      const chunkResults = parser.processContent(chunk!);
      results.push(...chunkResults);
    }

    // Combine all content
    const combinedContent = results
      .filter((r) => r.type === "content")
      .map((r) => r.content)
      .join("");

    expect(combinedContent).toBe(fullText);
    expect(combinedContent[0]).toBe("Y");
  });

  it("should preserve first character when processing content with thinking tags", () => {
    const contentWithThinking =
      "<think>I need to process this</think>You have tasks";
    const results = parser.processContent(contentWithThinking);

    // Should have thinking results and content results
    const contentResults = results.filter((r) => r.type === "content");
    expect(contentResults).toHaveLength(1);
    expect(contentResults[0]).toBeDefined();
    expect(contentResults[0]!.content).toBe("You have tasks");
    expect(contentResults[0]!.content?.[0]).toBe("Y");
  });

  it("should handle edge case of single character content", () => {
    const results = parser.processContent("Y");

    expect(results).toHaveLength(1);
    expect(results[0]).toBeDefined();
    expect(results[0]!.type).toBe("content");
    expect(results[0]!.content).toBe("Y");
  });

  it("should handle empty content gracefully", () => {
    const results = parser.processContent("");

    // Empty content should not produce any results
    expect(results).toHaveLength(0);
  });

  it("should validate that buffer state preserves characters correctly", () => {
    // Process partial content
    const results1 = parser.processContent("You have ta");

    // Now add more content
    const results2 = parser.processContent("sks to complete");

    // Flush the parser to get final content
    const finalResults = parser.flush();

    // Combine all results from all calls
    const allResults = [...results1, ...results2, ...finalResults];
    const combinedContent = allResults
      .filter((r) => r.type === "content")
      .map((r) => r.content)
      .join("");

    expect(combinedContent).toBe("You have tasks to complete");
    expect(combinedContent[0]).toBe("Y");
  });

  it("should handle typical streaming scenario that caused truncation bug", () => {
    // Simulate the exact streaming scenario from the backend logs
    // The bug: empty reasoning field was blocking content processing for "Y" chunk

    const typicalSSELines = [
      // First chunk: empty reasoning + "Y" content (this was being lost)
      'data: {"choices":[{"delta":{"content":"Y","reasoning":""}}]}',
      // Second chunk: null reasoning + "ou have th" content (this worked)
      'data: {"choices":[{"delta":{"content":"ou have th","reasoning":null}}]}',
      "data: [DONE]",
    ];

    let fullContent = "";

    for (const line of typicalSSELines) {
      const sseResult = parser.parseSSELine(line);
      if (sseResult && sseResult.type === "content" && sseResult.content) {
        const results = parser.processContent(sseResult.content);
        for (const result of results) {
          if (result.type === "content" && result.content) {
            fullContent += result.content;
          }
        }
      }
    }

    // Flush any remaining content
    const finalResults = parser.flush();
    for (const result of finalResults) {
      if (result.type === "content" && result.content) {
        fullContent += result.content;
      }
    }

    // The full content should start with "You" not "ou"
    expect(fullContent).toBe("You have th");
    expect(fullContent[0]).toBe("Y");

    // Test the responsePreview generation (first 200 chars)
    const responsePreview = fullContent.substring(0, 200);
    expect(responsePreview).toBe("You have th");
    expect(responsePreview[0]).toBe("Y");
  });

  it("should handle empty reasoning field correctly", () => {
    // Test the specific bug: empty reasoning should not block content processing
    const sseLineWithEmptyReasoning =
      'data: {"choices":[{"delta":{"content":"Y","reasoning":""}}]}';

    const result = parser.parseSSELine(sseLineWithEmptyReasoning);

    // Should return content, not reasoning
    expect(result?.type).toBe("content");
    expect(result?.content).toBe("Y");
  });

  it("should handle non-empty reasoning field correctly", () => {
    // Test that actual reasoning content is still processed
    const sseLineWithReasoning =
      'data: {"choices":[{"delta":{"content":"Hello","reasoning":"I need to think about this"}}]}';

    const result = parser.parseSSELine(sseLineWithReasoning);

    // Should return reasoning, not content
    expect(result?.type).toBe("reasoning");
    expect(result?.content).toBe("I need to think about this");
  });
});
