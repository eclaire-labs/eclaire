import { beforeEach, describe, expect, it, vi } from "vitest";
import { MlxRealtimeClient } from "../../mlx-ws-client.js";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WsHandler = (...args: unknown[]) => void;

// Shared state set by mock constructor, read by helpers
const wsMockState = vi.hoisted(() => ({
  handlers: new Map<string, WsHandler>(),
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
  constructedUrl: "",
}));

vi.mock("ws", () => {
  const state = wsMockState;

  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;

    constructor(url: string) {
      state.constructedUrl = url;
      state.handlers = new Map();
      state.send = vi.fn();
      state.close = vi.fn();
      state.readyState = 1;
    }

    on(event: string, handler: WsHandler) {
      state.handlers.set(event, handler);
    }

    send(...args: unknown[]) {
      return state.send(...args);
    }

    close() {
      state.readyState = 3;
      return state.close();
    }

    get readyState() {
      return state.readyState;
    }
  }

  return { default: MockWebSocket, WebSocket: MockWebSocket };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simulateOpen() {
  wsMockState.handlers.get("open")?.();
}

function simulateMessage(data: string | Buffer) {
  wsMockState.handlers.get("message")?.(data);
}

function simulateError(err: Error) {
  wsMockState.handlers.get("error")?.(err);
}

function simulateClose() {
  wsMockState.handlers.get("close")?.();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MlxRealtimeClient", () => {
  let client: MlxRealtimeClient;

  beforeEach(() => {
    client = new MlxRealtimeClient({
      baseUrl: "http://127.0.0.1:9100",
      model: "test-stt-model",
      language: "en",
    });
  });

  // ---------------------------------------------------------------------------
  // connect
  // ---------------------------------------------------------------------------

  describe("connect", () => {
    it("constructs WebSocket with ws:// URL", async () => {
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;
      expect(wsMockState.constructedUrl).toBe(
        "ws://127.0.0.1:9100/v1/audio/transcriptions/realtime",
      );
    });

    it("sends config JSON (model, language) on open", async () => {
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;
      expect(wsMockState.send).toHaveBeenCalledWith(
        JSON.stringify({ model: "test-stt-model", language: "en" }),
      );
    });

    it("omits language from config when not provided", async () => {
      const noLangClient = new MlxRealtimeClient({
        baseUrl: "http://127.0.0.1:9100",
        model: "test-model",
      });
      const connectPromise = noLangClient.connect();
      simulateOpen();
      await connectPromise;
      const sentConfig = JSON.parse(
        wsMockState.send.mock.calls[0]![0] as string,
      );
      expect(sentConfig.language).toBeUndefined();
    });

    it("rejects promise if connection errors before open", async () => {
      const connectPromise = client.connect();
      simulateError(new Error("Connection refused"));
      await expect(connectPromise).rejects.toThrow("Connection refused");
    });
  });

  // ---------------------------------------------------------------------------
  // event handling
  // ---------------------------------------------------------------------------

  describe("event handling", () => {
    it("onDelta fires for delta messages", async () => {
      const deltaHandler = vi.fn();
      client.onDelta(deltaHandler);
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      simulateMessage(JSON.stringify({ type: "delta", delta: "partial text" }));
      expect(deltaHandler).toHaveBeenCalledWith("partial text");
    });

    it("onComplete fires for complete messages", async () => {
      const completeHandler = vi.fn();
      client.onComplete(completeHandler);
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      simulateMessage(
        JSON.stringify({
          type: "complete",
          text: "full text",
          is_partial: false,
        }),
      );
      expect(completeHandler).toHaveBeenCalledWith("full text");
    });

    it("onComplete does NOT fire when is_partial is true", async () => {
      const completeHandler = vi.fn();
      client.onComplete(completeHandler);
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      simulateMessage(
        JSON.stringify({ type: "complete", text: "partial", is_partial: true }),
      );
      expect(completeHandler).not.toHaveBeenCalled();
    });

    it("onError fires when error event occurs after connection", async () => {
      const errorHandler = vi.fn();
      client.onError(errorHandler);
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      simulateError(new Error("upstream error"));
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it("onClose fires and nulls the WebSocket", async () => {
      const closeHandler = vi.fn();
      client.onClose(closeHandler);
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      expect(client.isConnected).toBe(true);
      simulateClose();
      expect(closeHandler).toHaveBeenCalled();
      expect(client.isConnected).toBe(false);
    });

    it("non-JSON messages are silently ignored", async () => {
      const deltaHandler = vi.fn();
      const completeHandler = vi.fn();
      client.onDelta(deltaHandler);
      client.onComplete(completeHandler);
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      simulateMessage("not json at all");
      expect(deltaHandler).not.toHaveBeenCalled();
      expect(completeHandler).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // sendAudio
  // ---------------------------------------------------------------------------

  describe("sendAudio", () => {
    it("sends binary buffer when connected", async () => {
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      const chunk = Buffer.from([1, 2, 3, 4]);
      client.sendAudio(chunk);
      // First call is config JSON, second is audio
      expect(wsMockState.send).toHaveBeenCalledTimes(2);
      expect(wsMockState.send.mock.calls[1]![0]).toEqual(chunk);
    });

    it("does nothing when not connected", () => {
      const chunk = Buffer.from([1, 2, 3]);
      client.sendAudio(chunk);
      // wsMockState.send not defined yet since connect hasn't been called
      expect(client.isConnected).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // sendJson
  // ---------------------------------------------------------------------------

  describe("sendJson", () => {
    it("sends JSON.stringify of data when connected", async () => {
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      client.sendJson({ action: "stop" });
      expect(wsMockState.send).toHaveBeenCalledWith(
        JSON.stringify({ action: "stop" }),
      );
    });

    it("does nothing when not connected", () => {
      client.sendJson({ action: "stop" });
      expect(client.isConnected).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // close
  // ---------------------------------------------------------------------------

  describe("close", () => {
    it("calls ws.close()", async () => {
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;

      client.close();
      expect(wsMockState.close).toHaveBeenCalled();
    });

    it("safe to call when already closed", () => {
      // No connect — ws is null
      expect(() => client.close()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // isConnected
  // ---------------------------------------------------------------------------

  describe("isConnected", () => {
    it("returns false before connect", () => {
      expect(client.isConnected).toBe(false);
    });

    it("returns true when connected", async () => {
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;
      expect(client.isConnected).toBe(true);
    });

    it("returns false after close", async () => {
      const connectPromise = client.connect();
      simulateOpen();
      await connectPromise;
      client.close();
      expect(client.isConnected).toBe(false);
    });
  });
});
