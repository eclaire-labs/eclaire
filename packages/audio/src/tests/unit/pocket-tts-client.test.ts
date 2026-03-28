import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PocketTtsClient } from "../../pocket-tts-client.js";
import { createMockFetch, type MockFetchInstance } from "../setup.js";

describe("PocketTtsClient", () => {
  let client: PocketTtsClient;
  let mockFetch: MockFetchInstance;

  beforeEach(() => {
    mockFetch = createMockFetch();
    vi.stubGlobal("fetch", mockFetch.fetch);
    client = new PocketTtsClient({
      baseUrl: "http://127.0.0.1:8000",
      timeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.reset();
  });

  // ---------------------------------------------------------------------------
  // ping
  // ---------------------------------------------------------------------------

  describe("ping", () => {
    it("hits /health endpoint", async () => {
      mockFetch.queueJsonResponse({}, 200);
      await client.ping();
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:8000/health");
    });

    it("returns true on 200", async () => {
      mockFetch.queueJsonResponse({}, 200);
      expect(await client.ping()).toBe(true);
    });

    it("returns false on error", async () => {
      mockFetch.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      expect(await client.ping()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // synthesize
  // ---------------------------------------------------------------------------

  describe("synthesize", () => {
    it("sends POST to /tts with multipart form", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize({ text: "Hello" });
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:8000/tts");
      expect(mockFetch.calls[0]!.init?.method).toBe("POST");
      expect(mockFetch.calls[0]!.init?.body).toBeInstanceOf(FormData);
    });

    it('includes "text" field in form data', async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize({ text: "Hello world" });
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("text")).toBe("Hello world");
    });

    it('includes "voice_url" only when voice is provided', async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize({ text: "Hello" });
      const body1 = mockFetch.calls[0]!.init?.body as FormData;
      expect(body1.get("voice_url")).toBeNull();

      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize({ text: "Hello", voice: "alba" });
      const body2 = mockFetch.calls[1]!.init?.body as FormData;
      expect(body2.get("voice_url")).toBe("alba");
    });

    it("returns Buffer from arrayBuffer response", async () => {
      mockFetch.queueBinaryResponse(Buffer.from([1, 2, 3, 4]));
      const result = await client.synthesize({ text: "Hello" });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(4);
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(client.synthesize({ text: "Hello" })).rejects.toThrow(
        "pocket-tts synthesis failed",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesizeStream
  // ---------------------------------------------------------------------------

  describe("synthesizeStream", () => {
    it("sends POST to /tts", async () => {
      mockFetch.queueResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        body: null,
      });
      await client.synthesizeStream({ text: "Hello" });
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:8000/tts");
    });

    it("returns raw Response on success", async () => {
      const mockBody = new ReadableStream<Uint8Array>();
      mockFetch.queueResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        body: mockBody,
      });
      const result = await client.synthesizeStream({ text: "Hello" });
      expect(result.body).toBe(mockBody);
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(client.synthesizeStream({ text: "Hello" })).rejects.toThrow(
        "pocket-tts streaming synthesis failed",
      );
    });
  });
});
