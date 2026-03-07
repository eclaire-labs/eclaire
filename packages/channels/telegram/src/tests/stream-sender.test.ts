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

function makeTelegram() {
  let messageCounter = 1;
  return {
    sendMessage: vi.fn(async () => ({ message_id: messageCounter++ })),
    editMessageText: vi.fn(async () => ({})),
  };
}

/** Get the text argument (4th positional) from the last editMessageText call. */
function lastEditText(tg: ReturnType<typeof makeTelegram>): unknown {
  // biome-ignore lint/suspicious/noExplicitAny: accessing mock call args by index
  const calls = tg.editMessageText.mock.calls as any[];
  // editMessageText(chatId, messageId, inlineMessageId, text, opts)
  return calls[calls.length - 1]?.[3];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendStreamingResponse", () => {
  it("sends initial message and edits with final text", async () => {
    const tg = makeTelegram();
    const stream = createStream([
      // Enough text to pass minimum threshold
      { type: "text-chunk", content: "Hello, this is a test response from the AI assistant." },
      { type: "done" },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const result = await sendStreamingResponse(tg as any, 123, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Hello, this is a test response from the AI assistant.");
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);
    expect(tg.sendMessage).toHaveBeenCalledWith(123, "▍", {});

    // Should have at least a final edit (without cursor)
    expect(lastEditText(tg)).toBe("Hello, this is a test response from the AI assistant.");
  });

  it("returns empty text and edits with fallback for empty stream", async () => {
    const tg = makeTelegram();
    const stream = createStream([{ type: "done" }]);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const result = await sendStreamingResponse(tg as any, 123, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("");
    expect(tg.sendMessage).toHaveBeenCalledTimes(1);

    expect(lastEditText(tg)).toBe("No response was generated.");
  });

  it("handles error events by editing the message", async () => {
    const tg = makeTelegram();
    const stream = createStream([
      { type: "text-chunk", content: "Starting..." },
      { type: "error", error: "Something went wrong" },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const result = await sendStreamingResponse(tg as any, 123, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Starting...");

    expect(lastEditText(tg)).toBe("Something went wrong");
  });

  it("accumulates multiple text chunks", async () => {
    const tg = makeTelegram();
    const stream = createStream([
      { type: "text-chunk", content: "Hello " },
      { type: "text-chunk", content: "world! " },
      { type: "text-chunk", content: "How are you today?" },
      { type: "done" },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const result = await sendStreamingResponse(tg as any, 123, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Hello world! How are you today?");

    // Final edit should have complete text without cursor
    expect(lastEditText(tg)).toBe("Hello world! How are you today?");
  });

  it("starts a new message when approaching 4096 char limit", async () => {
    const tg = makeTelegram();
    const longText = "a".repeat(4000);
    const stream = createStream([
      { type: "text-chunk", content: longText },
      { type: "text-chunk", content: "more text after limit" },
      { type: "done" },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await sendStreamingResponse(tg as any, 123, stream, {
      logger: mockLogger,
    });

    // Should have sent more than 1 message (initial + overflow)
    expect(tg.sendMessage.mock.calls.length).toBeGreaterThan(1);
  });

  it("ignores thought and tool-call events", async () => {
    const tg = makeTelegram();
    const stream = createStream([
      { type: "thought", content: "thinking..." },
      { type: "tool-call" },
      { type: "text-chunk", content: "The actual visible response text here." },
      { type: "done" },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const result = await sendStreamingResponse(tg as any, 123, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("The actual visible response text here.");
  });

  it("does not edit before minimum character threshold", async () => {
    const tg = makeTelegram();
    const stream = createStream([
      { type: "text-chunk", content: "Hi" },
      // Short text, below 30 char threshold
      { type: "done" },
    ]);

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    await sendStreamingResponse(tg as any, 123, stream, {
      logger: mockLogger,
    });

    // Final edit should be "Hi" (no cursor)
    expect(lastEditText(tg)).toBe("Hi");
  });

  it("handles stream read errors gracefully", async () => {
    const tg = makeTelegram();
    let enqueueCount = 0;
    const stream = new ReadableStream<StreamEvent>({
      pull(controller) {
        if (enqueueCount === 0) {
          enqueueCount++;
          controller.enqueue({ type: "text-chunk", content: "Partial response before error happens" });
        } else {
          controller.error(new Error("Stream broke"));
        }
      },
    });

    // biome-ignore lint/suspicious/noExplicitAny: test mock
    const result = await sendStreamingResponse(tg as any, 123, stream, {
      logger: mockLogger,
    });

    expect(result).toBe("Partial response before error happens");
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
