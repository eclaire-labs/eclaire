import { describe, expect, it, vi, beforeEach } from "vitest";
import { sendStreamingResponse } from "../stream-sender.js";
import type { StreamEvent } from "../deps.js";

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

function createStream(events: StreamEvent[]): ReadableStream<StreamEvent> {
  return new ReadableStream<StreamEvent>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(event);
      }
      controller.close();
    },
  });
}

function makeClient() {
  let tsCounter = 1;
  return {
    chat: {
      postMessage: vi.fn(async () => ({ ts: `${tsCounter++}.0000` })),
      update: vi.fn(async () => ({ ok: true })),
    },
  };
}

/** Get the text argument from the last chat.update call. */
function lastUpdateText(
  client: ReturnType<typeof makeClient>,
): string | undefined {
  const calls = client.chat.update.mock.calls;
  const lastCall = calls[calls.length - 1] as any[];
  return lastCall?.[0]?.text;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendStreamingResponse", () => {
  it("sends initial message and edits with final text", async () => {
    const client = makeClient();
    const stream = createStream([
      {
        type: "text-chunk",
        content: "Hello, this is a test response from the AI assistant.",
      },
      { type: "done" },
    ]);

    const result = await sendStreamingResponse(client as any, "C123", stream, {
      logger: mockLogger,
    });

    expect(result).toBe(
      "Hello, this is a test response from the AI assistant.",
    );
    expect(client.chat.postMessage).toHaveBeenCalledTimes(1);

    // Final edit should have complete text without cursor
    expect(lastUpdateText(client)).toBe(
      "Hello, this is a test response from the AI assistant.",
    );
  });

  it("returns empty text and shows fallback for empty stream", async () => {
    const client = makeClient();
    const stream = createStream([{ type: "done" }]);

    const result = await sendStreamingResponse(client as any, "C123", stream, {
      logger: mockLogger,
    });

    expect(result).toBe("");
    expect(client.chat.postMessage).toHaveBeenCalledTimes(1);
    expect(lastUpdateText(client)).toBe("No response was generated.");
  });

  it("handles error events by editing the message", async () => {
    const client = makeClient();
    const stream = createStream([
      { type: "text-chunk", content: "Starting..." },
      { type: "error", error: "Something went wrong" },
    ]);

    const result = await sendStreamingResponse(client as any, "C123", stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Starting...");
    expect(lastUpdateText(client)).toBe("Something went wrong");
  });

  it("accumulates multiple text chunks", async () => {
    const client = makeClient();
    const stream = createStream([
      { type: "text-chunk", content: "Hello " },
      { type: "text-chunk", content: "world! " },
      { type: "text-chunk", content: "How are you today?" },
      { type: "done" },
    ]);

    const result = await sendStreamingResponse(client as any, "C123", stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Hello world! How are you today?");
    expect(lastUpdateText(client)).toBe("Hello world! How are you today?");
  });

  it("starts a new message when approaching max message length", async () => {
    const client = makeClient();
    const longText = "a".repeat(3850);
    const stream = createStream([
      { type: "text-chunk", content: longText },
      { type: "text-chunk", content: "more text after limit" },
      { type: "done" },
    ]);

    await sendStreamingResponse(client as any, "C123", stream, {
      logger: mockLogger,
    });

    // Should have sent more than 1 message (initial + overflow)
    expect(client.chat.postMessage.mock.calls.length).toBeGreaterThan(1);
  });

  it("ignores thought and tool-call events", async () => {
    const client = makeClient();
    const stream = createStream([
      { type: "thought", content: "thinking..." },
      { type: "tool-call" },
      {
        type: "text-chunk",
        content: "The actual visible response text here.",
      },
      { type: "done" },
    ]);

    const result = await sendStreamingResponse(client as any, "C123", stream, {
      logger: mockLogger,
    });

    expect(result).toBe("The actual visible response text here.");
  });

  it("does not edit before minimum character threshold", async () => {
    const client = makeClient();
    const stream = createStream([
      { type: "text-chunk", content: "Hi" },
      { type: "done" },
    ]);

    await sendStreamingResponse(client as any, "C123", stream, {
      logger: mockLogger,
    });

    // Final edit should be "Hi" (no cursor)
    expect(lastUpdateText(client)).toBe("Hi");
  });

  it("handles stream read errors gracefully", async () => {
    const client = makeClient();
    let enqueueCount = 0;
    const stream = new ReadableStream<StreamEvent>({
      pull(controller) {
        if (enqueueCount === 0) {
          enqueueCount++;
          controller.enqueue({
            type: "text-chunk",
            content: "Partial response before error happens",
          });
        } else {
          controller.error(new Error("Stream broke"));
        }
      },
    });

    const result = await sendStreamingResponse(client as any, "C123", stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Partial response before error happens");
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
