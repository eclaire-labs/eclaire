import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OmlxAudioClient } from "../../omlx-client.js";
import { createMockFetch, type MockFetchInstance } from "../setup.js";

describe("OmlxAudioClient", () => {
  let client: OmlxAudioClient;
  let mockFetch: MockFetchInstance;

  beforeEach(() => {
    mockFetch = createMockFetch();
    vi.stubGlobal("fetch", mockFetch.fetch);
    client = new OmlxAudioClient({
      baseUrl: "http://127.0.0.1:8000",
      timeoutMs: 5000,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.reset();
  });

  // ---------------------------------------------------------------------------
  // constructor
  // ---------------------------------------------------------------------------

  describe("constructor", () => {
    it("strips trailing slashes from baseUrl", () => {
      const c = new OmlxAudioClient({
        baseUrl: "http://host:8000///",
        timeoutMs: 1000,
      });
      mockFetch.queueJsonResponse({}, 200);
      c.ping();
      expect(mockFetch.calls[0]!.url).toBe("http://host:8000/health");
    });
  });

  // ---------------------------------------------------------------------------
  // ping
  // ---------------------------------------------------------------------------

  describe("ping", () => {
    it("hits /health endpoint (not /)", async () => {
      mockFetch.queueJsonResponse({}, 200);
      await client.ping();
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:8000/health");
    });

    it("returns true when server responds with 200", async () => {
      mockFetch.queueJsonResponse({}, 200);
      expect(await client.ping()).toBe(true);
    });

    it("returns false when server responds with 500", async () => {
      mockFetch.queueErrorResponse(500, "Internal Server Error");
      expect(await client.ping()).toBe(false);
    });

    it("returns false when fetch throws (network error)", async () => {
      mockFetch.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      expect(await client.ping()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // listModels
  // ---------------------------------------------------------------------------

  describe("listModels", () => {
    it("returns parsed model list on success", async () => {
      const data = { data: [{ id: "model-1" }] };
      mockFetch.queueJsonResponse(data);
      const result = await client.listModels();
      expect(result).toEqual(data);
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:8000/v1/models");
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Internal Server Error");
      await expect(client.listModels()).rejects.toThrow(
        "oMLX /v1/models failed",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // transcribe
  // ---------------------------------------------------------------------------

  describe("transcribe", () => {
    const baseInput = {
      file: Buffer.from("fake-audio"),
      fileName: "test.wav",
      model: "stt-model",
    };

    it("sends POST to /v1/audio/transcriptions", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      expect(mockFetch.calls[0]!.url).toBe(
        "http://127.0.0.1:8000/v1/audio/transcriptions",
      );
      expect(mockFetch.calls[0]!.init?.method).toBe("POST");
    });

    it("parses single JSON response (not NDJSON)", async () => {
      mockFetch.queueJsonResponse({
        text: "hello world",
        language: "en",
        duration: 1.5,
      });
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("hello world");
    });

    it("returns empty string when text field is missing", async () => {
      mockFetch.queueJsonResponse({ language: "en" });
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("");
    });

    it("includes model in form data", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("model")).toBe("stt-model");
    });

    it("includes language when provided", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe({ ...baseInput, language: "fr" });
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("language")).toBe("fr");
    });

    it("omits language when not provided", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("language")).toBeNull();
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(client.transcribe(baseInput)).rejects.toThrow(
        "oMLX transcription failed",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesize
  // ---------------------------------------------------------------------------

  describe("synthesize", () => {
    it("sends POST to /v1/audio/speech with JSON body", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio-data"));
      await client.synthesize({ model: "tts-model", text: "Hello" });
      expect(mockFetch.calls[0]!.url).toBe(
        "http://127.0.0.1:8000/v1/audio/speech",
      );
      expect(mockFetch.calls[0]!.init?.method).toBe("POST");
      expect(mockFetch.calls[0]!.init?.headers).toEqual({
        "Content-Type": "application/json",
      });
    });

    it('maps "text" to "input" field in body', async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio-data"));
      await client.synthesize({ model: "tts-model", text: "Hello world" });
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.input).toBe("Hello world");
      expect(body.text).toBeUndefined();
    });

    it('uses "instructions" field (not "instruct")', async () => {
      mockFetch.queueBinaryResponse(Buffer.from("a"));
      await client.synthesize({
        model: "m",
        text: "t",
        instructions: "speak happily",
      });
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.instructions).toBe("speak happily");
      expect(body.instruct).toBeUndefined();
    });

    it('maps "format" to "response_format"', async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio-data"));
      await client.synthesize({ model: "m", text: "t", format: "wav" });
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.response_format).toBe("wav");
    });

    it("includes voice and speed only when provided", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("a"));
      await client.synthesize({ model: "m", text: "t" });
      const body1 = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body1.voice).toBeUndefined();
      expect(body1.speed).toBeUndefined();

      mockFetch.queueBinaryResponse(Buffer.from("a"));
      await client.synthesize({
        model: "m",
        text: "t",
        voice: "v",
        speed: 1.5,
      });
      const body2 = JSON.parse(mockFetch.calls[1]!.init?.body as string);
      expect(body2.voice).toBe("v");
      expect(body2.speed).toBe(1.5);
    });

    it("returns Buffer from arrayBuffer response", async () => {
      const audioData = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      mockFetch.queueBinaryResponse(audioData);
      const result = await client.synthesize({ model: "m", text: "t" });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(4);
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(
        client.synthesize({ model: "m", text: "t" }),
      ).rejects.toThrow("oMLX speech synthesis failed");
    });
  });

  // ---------------------------------------------------------------------------
  // synthesizeStream
  // ---------------------------------------------------------------------------

  describe("synthesizeStream", () => {
    it("includes stream: true in body", async () => {
      mockFetch.queueResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        body: null,
      });
      await client.synthesizeStream({ model: "m", text: "t" });
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.stream).toBe(true);
    });

    it("returns the raw Response on success", async () => {
      const mockBody = new ReadableStream<Uint8Array>();
      mockFetch.queueResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        body: mockBody,
      });
      const result = await client.synthesizeStream({ model: "m", text: "t" });
      expect(result.body).toBe(mockBody);
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(
        client.synthesizeStream({ model: "m", text: "t" }),
      ).rejects.toThrow("oMLX streaming speech synthesis failed");
    });
  });
});
