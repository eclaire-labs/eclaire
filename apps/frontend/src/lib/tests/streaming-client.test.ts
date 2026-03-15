import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamingRequest } from "@/lib/streaming-client";
import { StreamingClient } from "@/lib/streaming-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build SSE lines from an array of raw SSE strings and return a Response
 *  whose body is a ReadableStream that emits them. Each string should already
 *  be formatted as `data: {...}\n\n`. */
function createSSEResponse(events: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

/** Shorthand: wrap a JSON-serialisable event object into the SSE wire format. */
function sseData(obj: Record<string, unknown>): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/** Create a minimal StreamingRequest for tests. */
function makeRequest(
  overrides: Partial<StreamingRequest> = {},
): StreamingRequest {
  return { sessionId: "sess-1", prompt: "hello", ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StreamingClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Constructor & utility
  // -----------------------------------------------------------------------

  describe("constructor & utility methods", () => {
    it("isStreamConnected() returns false initially", () => {
      const client = new StreamingClient();
      expect(client.isStreamConnected()).toBe(false);
    });

    it("updateHandlers() merges new handlers with existing ones", () => {
      const onThought = vi.fn();
      const onError = vi.fn();
      const client = new StreamingClient({ onThought });

      client.updateHandlers({ onError });

      // Verify both handlers are present by triggering a stream that
      // exercises them.
      const events = [
        sseData({ type: "thought", content: "thinking" }),
        sseData({ type: "error", error: "oops" }),
        sseData({ type: "done" }),
      ];

      fetchMock.mockResolvedValueOnce(createSSEResponse(events));
      // Fire-and-forget; we await below indirectly via handler assertions.
      const promise = client.startStream(makeRequest());
      return promise.then(() => {
        expect(onThought).toHaveBeenCalledWith("thinking", undefined);
        expect(onError).toHaveBeenCalledWith("oops", undefined);
      });
    });
  });

  // -----------------------------------------------------------------------
  // startStream – happy path
  // -----------------------------------------------------------------------

  describe("startStream – happy path", () => {
    it("sends POST to /api/sessions/:id/messages with correct headers and JSON body", async () => {
      const events = [sseData({ type: "done" })];
      fetchMock.mockResolvedValueOnce(createSSEResponse(events));

      const request = makeRequest({
        sessionId: "sess-42",
        prompt: "test prompt",
      });

      const client = new StreamingClient();
      await client.startStream(request);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, options] = fetchMock.mock.calls[0]!;
      expect(url).toBe("/api/sessions/sess-42/messages");
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({ "Content-Type": "application/json" });
      // sessionId should NOT be in the body
      expect(JSON.parse(options.body)).toEqual({ prompt: "test prompt" });
    });

    it("calls onConnect when stream starts", async () => {
      const onConnect = vi.fn();
      const events = [sseData({ type: "done" })];
      fetchMock.mockResolvedValueOnce(createSSEResponse(events));

      const client = new StreamingClient({ onConnect });
      await client.startStream(makeRequest());

      expect(onConnect).toHaveBeenCalledOnce();
    });

    it('routes "thought" events to onThought handler', async () => {
      const onThought = vi.fn();
      const events = [
        sseData({
          type: "thought",
          content: "Let me think...",
          timestamp: "2025-01-01T00:00:00Z",
        }),
        sseData({ type: "done" }),
      ];
      fetchMock.mockResolvedValueOnce(createSSEResponse(events));

      const client = new StreamingClient({ onThought });
      await client.startStream(makeRequest());

      expect(onThought).toHaveBeenCalledOnce();
      expect(onThought).toHaveBeenCalledWith(
        "Let me think...",
        "2025-01-01T00:00:00Z",
      );
    });

    it('routes "tool-call" events to onToolCall handler', async () => {
      const onToolCall = vi.fn();
      const events = [
        sseData({
          type: "tool-call",
          name: "search",
          status: "completed",
          arguments: { query: "vitest" },
          result: { found: true },
          error: undefined,
        }),
        sseData({ type: "done" }),
      ];
      fetchMock.mockResolvedValueOnce(createSSEResponse(events));

      const client = new StreamingClient({ onToolCall });
      await client.startStream(makeRequest());

      expect(onToolCall).toHaveBeenCalledOnce();
      expect(onToolCall).toHaveBeenCalledWith(
        undefined, // id (not set in this event)
        "search",
        "completed",
        { query: "vitest" },
        { found: true },
        undefined,
      );
    });

    it('routes "text-chunk" events to onTextChunk handler', async () => {
      const onTextChunk = vi.fn();
      const events = [
        sseData({ type: "text-chunk", content: "Hello ", timestamp: "t1" }),
        sseData({ type: "text-chunk", content: "world!", timestamp: "t2" }),
        sseData({ type: "done" }),
      ];
      fetchMock.mockResolvedValueOnce(createSSEResponse(events));

      const client = new StreamingClient({ onTextChunk });
      await client.startStream(makeRequest());

      expect(onTextChunk).toHaveBeenCalledTimes(2);
      expect(onTextChunk).toHaveBeenNthCalledWith(1, "Hello ", "t1");
      expect(onTextChunk).toHaveBeenNthCalledWith(2, "world!", "t2");
    });

    it('routes "done" events to onDone handler and stops reading', async () => {
      const onDone = vi.fn();
      const onTextChunk = vi.fn();
      const events = [
        sseData({
          type: "done",
          requestId: "req-1",
          conversationId: "conv-1",
          totalTokens: 150,
          executionTimeMs: 3200,
        }),
        // This event appears after "done" and should never be processed.
        sseData({ type: "text-chunk", content: "should not appear" }),
      ];
      fetchMock.mockResolvedValueOnce(createSSEResponse(events));

      const client = new StreamingClient({ onDone, onTextChunk });
      await client.startStream(makeRequest());

      expect(onDone).toHaveBeenCalledOnce();
      expect(onDone).toHaveBeenCalledWith("req-1", "conv-1", 150, 3200);
      expect(onTextChunk).not.toHaveBeenCalled();
    });

    it("calls onDisconnect when stream ends", async () => {
      const onDisconnect = vi.fn();
      const events = [sseData({ type: "done" })];
      fetchMock.mockResolvedValueOnce(createSSEResponse(events));

      const client = new StreamingClient({ onDisconnect });
      await client.startStream(makeRequest());

      // disconnect() is called once at the start of startStream (to clean up
      // any prior connection) which fires onDisconnect, and then the finally
      // block in parseStreamingResponse fires it again when the stream ends.
      expect(onDisconnect).toHaveBeenCalledTimes(2);
      expect(client.isStreamConnected()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // startStream – error paths
  // -----------------------------------------------------------------------

  describe("startStream – error paths", () => {
    it("HTTP error response calls onError with parsed error message", async () => {
      const onError = vi.fn();
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      );

      const client = new StreamingClient({ onError });
      await client.startStream(makeRequest());

      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith("Unauthorized");
    });

    it("non-streaming content type (application/json) calls onError with JSON message", async () => {
      const onError = vi.fn();
      const jsonBody = { reply: "not a stream" };
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify(jsonBody), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const client = new StreamingClient({ onError });
      await client.startStream(makeRequest());

      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(
        `Expected streaming but got JSON: ${JSON.stringify(jsonBody)}`,
      );
    });

    it("non-streaming content type (text/plain) calls onError with content-type message", async () => {
      const onError = vi.fn();
      fetchMock.mockResolvedValueOnce(
        new Response("plain text body", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );

      const client = new StreamingClient({ onError });
      await client.startStream(makeRequest());

      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(
        "Expected streaming response but got: text/plain",
      );
    });

    it("no response body calls onError", async () => {
      const onError = vi.fn();
      // Create a Response with the right content-type but null body by
      // constructing a custom object that quacks like a Response.
      const fakeResponse = {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/event-stream" }),
        json: vi.fn(),
        text: vi.fn(),
        body: null,
      } as unknown as Response;

      fetchMock.mockResolvedValueOnce(fakeResponse);

      const client = new StreamingClient({ onError });
      await client.startStream(makeRequest());

      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(
        "No response body available for streaming",
      );
    });
  });

  // -----------------------------------------------------------------------
  // disconnect
  // -----------------------------------------------------------------------

  describe("disconnect", () => {
    it("sets isStreamConnected to false and calls onDisconnect", async () => {
      const onDisconnect = vi.fn();
      const onConnect = vi.fn();

      // Start a stream so the client becomes connected.
      const events = [
        sseData({ type: "text-chunk", content: "hi" }),
        sseData({ type: "done" }),
      ];
      fetchMock.mockResolvedValueOnce(createSSEResponse(events));

      const client = new StreamingClient({ onConnect, onDisconnect });
      await client.startStream(makeRequest());

      // startStream calls disconnect() first (1 onDisconnect), then the
      // finally block fires onDisconnect again (2 total).
      expect(onDisconnect).toHaveBeenCalledTimes(2);

      // Explicitly disconnect again — should still invoke onDisconnect.
      client.disconnect();
      expect(client.isStreamConnected()).toBe(false);
      expect(onDisconnect).toHaveBeenCalledTimes(3);
    });
  });
});
