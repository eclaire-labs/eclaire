import { describe, expect, it } from "vitest";
import { transformRuntimeEvent } from "../../lib/agent/prompt-service.js";

describe("transformRuntimeEvent", () => {
  // ---------------------------------------------------------------
  // text_delta -> text-chunk
  // ---------------------------------------------------------------
  it("maps text_delta to text-chunk with content", () => {
    const result = transformRuntimeEvent({ type: "text_delta", text: "Hello" });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("text-chunk");
    expect(result!.content).toBe("Hello");
  });

  // ---------------------------------------------------------------
  // thinking_delta -> thought
  // ---------------------------------------------------------------
  it("maps thinking_delta to thought with content", () => {
    const result = transformRuntimeEvent({
      type: "thinking_delta",
      text: "Let me think...",
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("thought");
    expect(result!.content).toBe("Let me think...");
  });

  // ---------------------------------------------------------------
  // tool_call_start -> tool-call (starting)
  // ---------------------------------------------------------------
  it("maps tool_call_start to tool-call with status starting", () => {
    const result = transformRuntimeEvent({
      type: "tool_call_start",
      id: "call_1",
      name: "findContent",
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("tool-call");
    expect(result!.id).toBe("call_1");
    expect(result!.name).toBe("findContent");
    expect(result!.status).toBe("starting");
  });

  // ---------------------------------------------------------------
  // tool_call_end -> tool-call (executing) with arguments
  // ---------------------------------------------------------------
  it("maps tool_call_end to tool-call with status executing and arguments", () => {
    const args = { query: "test", limit: 10 };
    const result = transformRuntimeEvent({
      type: "tool_call_end",
      id: "call_2",
      name: "findContent",
      arguments: args,
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("tool-call");
    expect(result!.id).toBe("call_2");
    expect(result!.name).toBe("findContent");
    expect(result!.status).toBe("executing");
    expect(result!.arguments).toEqual(args);
  });

  // ---------------------------------------------------------------
  // tool_progress -> tool-call (executing)
  // ---------------------------------------------------------------
  it("maps tool_progress to tool-call with status executing", () => {
    const result = transformRuntimeEvent({
      type: "tool_progress",
      id: "call_3",
      name: "browseWeb",
      progress: { status: "loading", progress: 0.5 },
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("tool-call");
    expect(result!.id).toBe("call_3");
    expect(result!.name).toBe("browseWeb");
    expect(result!.status).toBe("executing");
    // progress details are not forwarded to the stream event
    expect(result!.arguments).toBeUndefined();
  });

  // ---------------------------------------------------------------
  // tool_result success -> tool-call (completed) with result text
  // ---------------------------------------------------------------
  it("maps successful tool_result to tool-call with status completed and result text", () => {
    const result = transformRuntimeEvent({
      type: "tool_result",
      id: "call_4",
      name: "findContent",
      result: {
        isError: false,
        content: [{ type: "text", text: "Found 3 notes." }],
      },
      durationMs: 120,
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("tool-call");
    expect(result!.id).toBe("call_4");
    expect(result!.name).toBe("findContent");
    expect(result!.status).toBe("completed");
    expect(result!.result).toBe("Found 3 notes.");
    expect(result!.error).toBeUndefined();
  });

  // ---------------------------------------------------------------
  // tool_result error -> tool-call (error) with error text
  // ---------------------------------------------------------------
  it("maps error tool_result to tool-call with status error and error text", () => {
    const result = transformRuntimeEvent({
      type: "tool_result",
      id: "call_5",
      name: "createNote",
      result: {
        isError: true,
        content: [{ type: "text", text: "Permission denied" }],
      },
      durationMs: 50,
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("tool-call");
    expect(result!.id).toBe("call_5");
    expect(result!.name).toBe("createNote");
    expect(result!.status).toBe("error");
    expect(result!.error).toBe("Permission denied");
    expect(result!.result).toBeUndefined();
  });

  // ---------------------------------------------------------------
  // tool_result with multiple text content blocks -> joins with newline
  // ---------------------------------------------------------------
  it("joins multiple text content blocks with newline for tool_result", () => {
    const result = transformRuntimeEvent({
      type: "tool_result",
      id: "call_6",
      name: "findContent",
      result: {
        isError: false,
        content: [
          { type: "text", text: "Line 1" },
          { type: "text", text: "Line 2" },
          { type: "text", text: "Line 3" },
        ],
      },
      durationMs: 200,
    });

    expect(result).not.toBeNull();
    expect(result!.status).toBe("completed");
    expect(result!.result).toBe("Line 1\nLine 2\nLine 3");
  });

  // ---------------------------------------------------------------
  // tool_result filters out non-text content blocks
  // ---------------------------------------------------------------
  it("filters out non-text content blocks in tool_result", () => {
    const result = transformRuntimeEvent({
      type: "tool_result",
      id: "call_7",
      name: "findContent",
      result: {
        isError: false,
        content: [
          { type: "text", text: "Text block" },
          { type: "image", data: "base64..." } as unknown as {
            type: "text";
            text: string;
          },
          { type: "text", text: "Another text block" },
        ],
      },
      durationMs: 100,
    });

    expect(result).not.toBeNull();
    expect(result!.result).toBe("Text block\nAnother text block");
  });

  // ---------------------------------------------------------------
  // tool_approval_required -> approval-required
  // ---------------------------------------------------------------
  it("maps tool_approval_required to approval-required with label and arguments", () => {
    const args = { path: "/etc/hosts" };
    const result = transformRuntimeEvent({
      type: "tool_approval_required",
      id: "call_8",
      name: "fileWrite",
      label: "Write to /etc/hosts",
      arguments: args,
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("approval-required");
    expect(result!.id).toBe("call_8");
    expect(result!.name).toBe("fileWrite");
    expect(result!.label).toBe("Write to /etc/hosts");
    expect(result!.arguments).toEqual(args);
  });

  // ---------------------------------------------------------------
  // tool_approval_resolved approved -> approval-resolved with approved=true
  // ---------------------------------------------------------------
  it("maps tool_approval_resolved to approval-resolved with approved=true", () => {
    const result = transformRuntimeEvent({
      type: "tool_approval_resolved",
      id: "call_9",
      name: "fileWrite",
      approved: true,
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("approval-resolved");
    expect(result!.id).toBe("call_9");
    expect(result!.name).toBe("fileWrite");
    expect(result!.approved).toBe(true);
    expect(result!.reason).toBeUndefined();
  });

  // ---------------------------------------------------------------
  // tool_approval_resolved denied -> approval-resolved with approved=false and reason
  // ---------------------------------------------------------------
  it("maps tool_approval_resolved denied to approval-resolved with reason", () => {
    const result = transformRuntimeEvent({
      type: "tool_approval_resolved",
      id: "call_10",
      name: "fileWrite",
      approved: false,
      reason: "User declined the operation",
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("approval-resolved");
    expect(result!.id).toBe("call_10");
    expect(result!.name).toBe("fileWrite");
    expect(result!.approved).toBe(false);
    expect(result!.reason).toBe("User declined the operation");
  });

  // ---------------------------------------------------------------
  // error -> error with error message
  // ---------------------------------------------------------------
  it("maps error to error with error message", () => {
    const result = transformRuntimeEvent({
      type: "error",
      error: "Rate limit exceeded",
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe("error");
    expect(result!.error).toBe("Rate limit exceeded");
  });

  // ---------------------------------------------------------------
  // Internal events -> all return null
  // ---------------------------------------------------------------
  describe("internal events return null", () => {
    it.each([
      { type: "text_start" as const },
      { type: "text_end" as const },
      { type: "thinking_start" as const },
      { type: "thinking_end" as const },
      { type: "tool_call_delta" as const, id: "call_x", delta: "partial" },
      {
        type: "message_complete" as const,
        message: { role: "assistant", content: [] } as never,
      },
      {
        type: "turn_complete" as const,
        messages: [] as never,
      },
    ])("returns null for $type", (event: unknown) => {
      const result = transformRuntimeEvent(
        event as import("@eclaire/ai").RuntimeStreamEvent,
      );
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // All returned events include a timestamp string
  // ---------------------------------------------------------------
  describe("timestamp", () => {
    it("includes a valid ISO timestamp on text-chunk events", () => {
      const result = transformRuntimeEvent({
        type: "text_delta",
        text: "hi",
      });

      expect(result).not.toBeNull();
      expect(typeof result!.timestamp).toBe("string");
      // Verify it parses as a valid date
      const parsed = new Date(result!.timestamp!);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it("includes a valid ISO timestamp on thought events", () => {
      const result = transformRuntimeEvent({
        type: "thinking_delta",
        text: "hmm",
      });

      expect(result!.timestamp).toBeDefined();
      expect(new Date(result!.timestamp!).getTime()).not.toBeNaN();
    });

    it("includes a valid ISO timestamp on tool-call events", () => {
      const result = transformRuntimeEvent({
        type: "tool_call_start",
        id: "tc_1",
        name: "test",
      });

      expect(result!.timestamp).toBeDefined();
      expect(new Date(result!.timestamp!).getTime()).not.toBeNaN();
    });

    it("includes a valid ISO timestamp on error events", () => {
      const result = transformRuntimeEvent({
        type: "error",
        error: "fail",
      });

      expect(result!.timestamp).toBeDefined();
      expect(new Date(result!.timestamp!).getTime()).not.toBeNaN();
    });

    it("includes a valid ISO timestamp on approval-required events", () => {
      const result = transformRuntimeEvent({
        type: "tool_approval_required",
        id: "ap_1",
        name: "fileWrite",
        label: "Write file",
        arguments: {},
      });

      expect(result!.timestamp).toBeDefined();
      expect(new Date(result!.timestamp!).getTime()).not.toBeNaN();
    });

    it("includes a valid ISO timestamp on approval-resolved events", () => {
      const result = transformRuntimeEvent({
        type: "tool_approval_resolved",
        id: "ap_1",
        name: "fileWrite",
        approved: true,
      });

      expect(result!.timestamp).toBeDefined();
      expect(new Date(result!.timestamp!).getTime()).not.toBeNaN();
    });
  });

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------
  describe("edge cases", () => {
    it("handles empty text in text_delta", () => {
      const result = transformRuntimeEvent({
        type: "text_delta",
        text: "",
      });

      expect(result).not.toBeNull();
      expect(result!.type).toBe("text-chunk");
      expect(result!.content).toBe("");
    });

    it("handles tool_result with empty content array", () => {
      const result = transformRuntimeEvent({
        type: "tool_result",
        id: "call_empty",
        name: "someTask",
        result: {
          isError: false,
          content: [],
        },
        durationMs: 10,
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe("completed");
      expect(result!.result).toBe("");
    });

    it("handles error tool_result with empty content array", () => {
      const result = transformRuntimeEvent({
        type: "tool_result",
        id: "call_empty_err",
        name: "someTask",
        result: {
          isError: true,
          content: [],
        },
        durationMs: 10,
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe("error");
      expect(result!.error).toBe("");
    });

    it("handles empty error string", () => {
      const result = transformRuntimeEvent({
        type: "error",
        error: "",
      });

      expect(result).not.toBeNull();
      expect(result!.type).toBe("error");
      expect(result!.error).toBe("");
    });

    it("handles tool_call_end with empty arguments object", () => {
      const result = transformRuntimeEvent({
        type: "tool_call_end",
        id: "call_no_args",
        name: "noArgsTool",
        arguments: {},
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe("executing");
      expect(result!.arguments).toEqual({});
    });
  });
});
