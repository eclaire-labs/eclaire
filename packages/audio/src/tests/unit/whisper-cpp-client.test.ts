import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhisperCppClient } from "../../whisper-cpp-client.js";
import { createMockFetch, type MockFetchInstance } from "../setup.js";

describe("WhisperCppClient", () => {
  let client: WhisperCppClient;
  let mockFetch: MockFetchInstance;

  beforeEach(() => {
    mockFetch = createMockFetch();
    vi.stubGlobal("fetch", mockFetch.fetch);
    client = new WhisperCppClient({
      baseUrl: "http://127.0.0.1:8080",
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
    it("returns true when server responds with 200", async () => {
      mockFetch.queueJsonResponse({}, 200);
      expect(await client.ping()).toBe(true);
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:8080/");
    });

    it("returns false when server responds with error", async () => {
      mockFetch.queueErrorResponse(500, "Internal Server Error");
      expect(await client.ping()).toBe(false);
    });

    it("returns false when fetch throws", async () => {
      mockFetch.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      expect(await client.ping()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // transcribe
  // ---------------------------------------------------------------------------

  describe("transcribe", () => {
    const baseInput = { file: Buffer.from("fake-audio"), fileName: "test.wav" };

    it("sends POST to /inference with multipart form", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:8080/inference");
      expect(mockFetch.calls[0]!.init?.method).toBe("POST");
      expect(mockFetch.calls[0]!.init?.body).toBeInstanceOf(FormData);
    });

    it('includes response_format: "json" in form data', async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("response_format")).toBe("json");
    });

    it("includes language when provided", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe({ ...baseInput, language: "en" });
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("language")).toBe("en");
    });

    it("omits language when not provided", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("language")).toBeNull();
    });

    it("returns { text } from JSON response", async () => {
      mockFetch.queueJsonResponse({ text: "transcribed text" });
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("transcribed text");
    });

    it("returns empty string when text is not a string", async () => {
      mockFetch.queueJsonResponse({ text: 42 });
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("");
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(client.transcribe(baseInput)).rejects.toThrow(
        "whisper-cpp transcription failed",
      );
    });
  });
});
