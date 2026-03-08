import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamEvent } from "../deps.js";
import { sendStreamingResponse } from "../stream-sender.js";

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

// Track all created messages so we can inspect edit calls
interface MockMessage {
  id: string;
  edit: ReturnType<typeof vi.fn>;
}

function makeChannel() {
  let counter = 1;
  const messages: MockMessage[] = [];
  return {
    id: "test-channel",
    messages,
    send: vi.fn(async () => {
      const msg: MockMessage = {
        id: `msg-${counter++}`,
        edit: vi.fn(async () => ({})),
      };
      messages.push(msg);
      return msg;
    }),
  };
}

/** Get the text from the last edit() call across all messages */
function getLastEditText(
  channel: ReturnType<typeof makeChannel>,
): string | undefined {
  for (let i = channel.messages.length - 1; i >= 0; i--) {
    const msg = channel.messages[i]!;
    if (msg.edit.mock.calls.length > 0) {
      const editCalls = msg.edit.mock.calls;
      return editCalls[editCalls.length - 1]?.[0] as string;
    }
  }
  return undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendStreamingResponse", () => {
  it("sends initial message and edits with final text", async () => {
    const channel = makeChannel();
    const stream = createStream([
      {
        type: "text-chunk",
        content: "Hello, this is a test response from the AI assistant.",
      },
      { type: "done" },
    ]);

    const result = await sendStreamingResponse(channel as any, stream, {
      logger: mockLogger,
    });

    expect(result).toBe(
      "Hello, this is a test response from the AI assistant.",
    );
    expect(channel.send).toHaveBeenCalledTimes(1);
    // Initial message should contain cursor
    expect(channel.send).toHaveBeenCalledWith("◍");
    // Final edit should have complete text without cursor
    expect(getLastEditText(channel)).toBe(
      "Hello, this is a test response from the AI assistant.",
    );
  });

  it("returns empty text and edits with fallback for empty stream", async () => {
    const channel = makeChannel();
    const stream = createStream([{ type: "done" }]);

    const result = await sendStreamingResponse(channel as any, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("");
    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(getLastEditText(channel)).toBe("No response was generated.");
  });

  it("handles error events by editing the message", async () => {
    const channel = makeChannel();
    const stream = createStream([
      { type: "text-chunk", content: "Starting..." },
      { type: "error", error: "Something went wrong" },
    ]);

    const result = await sendStreamingResponse(channel as any, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Starting...");
    expect(getLastEditText(channel)).toBe("Something went wrong");
  });

  it("accumulates multiple text chunks", async () => {
    const channel = makeChannel();
    const stream = createStream([
      { type: "text-chunk", content: "Hello " },
      { type: "text-chunk", content: "world! " },
      { type: "text-chunk", content: "How are you today?" },
      { type: "done" },
    ]);

    const result = await sendStreamingResponse(channel as any, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Hello world! How are you today?");
    expect(getLastEditText(channel)).toBe("Hello world! How are you today?");
  });

  it("starts a new message when approaching 2000 char limit", async () => {
    const channel = makeChannel();
    const longText = "a".repeat(1900);
    const stream = createStream([
      { type: "text-chunk", content: longText },
      { type: "text-chunk", content: "more text after limit" },
      { type: "done" },
    ]);

    await sendStreamingResponse(channel as any, stream, {
      logger: mockLogger,
    });

    // Should have sent more than 1 message (initial + overflow)
    expect(channel.send.mock.calls.length).toBeGreaterThan(1);
  });

  it("ignores thought and tool-call events", async () => {
    const channel = makeChannel();
    const stream = createStream([
      { type: "thought", content: "thinking..." },
      { type: "tool-call" },
      { type: "text-chunk", content: "The actual visible response text here." },
      { type: "done" },
    ]);

    const result = await sendStreamingResponse(channel as any, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("The actual visible response text here.");
  });

  it("handles stream read errors gracefully", async () => {
    const channel = makeChannel();
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

    const result = await sendStreamingResponse(channel as any, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Partial response before error happens");
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("does not edit before minimum character threshold", async () => {
    const channel = makeChannel();
    const stream = createStream([
      { type: "text-chunk", content: "Hi" },
      { type: "done" },
    ]);

    await sendStreamingResponse(channel as any, stream, {
      logger: mockLogger,
    });

    // Final edit should be "Hi" (no cursor)
    expect(getLastEditText(channel)).toBe("Hi");
  });
});
