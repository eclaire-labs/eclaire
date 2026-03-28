import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MlxAudioClient } from "../../mlx-client.js";
import { createMockFetch, type MockFetchInstance } from "../setup.js";

describe("MlxAudioClient", () => {
  let client: MlxAudioClient;
  let mockFetch: MockFetchInstance;

  beforeEach(() => {
    mockFetch = createMockFetch();
    vi.stubGlobal("fetch", mockFetch.fetch);
    client = new MlxAudioClient({
      baseUrl: "http://127.0.0.1:9100",
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
      const c = new MlxAudioClient({
        baseUrl: "http://host:9100///",
        timeoutMs: 1000,
      });
      mockFetch.queueJsonResponse({}, 200);
      c.ping();
      expect(mockFetch.calls[0]!.url).toBe("http://host:9100/");
    });
  });

  // ---------------------------------------------------------------------------
  // ping
  // ---------------------------------------------------------------------------

  describe("ping", () => {
    it("returns true when server responds with 200", async () => {
      mockFetch.queueJsonResponse({}, 200);
      expect(await client.ping()).toBe(true);
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:9100/");
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
    it("returns parsed MlxModelsResponse on success", async () => {
      const data = {
        object: "list",
        data: [
          { id: "model-1", object: "model", created: 0, owned_by: "test" },
        ],
      };
      mockFetch.queueJsonResponse(data);
      const result = await client.listModels();
      expect(result).toEqual(data);
      expect(mockFetch.calls[0]!.url).toBe("http://127.0.0.1:9100/v1/models");
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Internal Server Error");
      await expect(client.listModels()).rejects.toThrow(
        "mlx-audio /v1/models failed",
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
      mockFetch.queueTextResponse('{"text":"hello","accumulated":"hello"}');
      await client.transcribe(baseInput);
      expect(mockFetch.calls[0]!.url).toBe(
        "http://127.0.0.1:9100/v1/audio/transcriptions",
      );
      expect(mockFetch.calls[0]!.init?.method).toBe("POST");
    });

    it("includes model in form data", async () => {
      mockFetch.queueTextResponse('{"text":"hello","accumulated":"hello"}');
      await client.transcribe(baseInput);
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("model")).toBe("stt-model");
    });

    it("includes language when provided", async () => {
      mockFetch.queueTextResponse('{"text":"hello","accumulated":"hello"}');
      await client.transcribe({ ...baseInput, language: "fr" });
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("language")).toBe("fr");
    });

    it("omits language when not provided", async () => {
      mockFetch.queueTextResponse('{"text":"hello","accumulated":"hello"}');
      await client.transcribe(baseInput);
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("language")).toBeNull();
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(client.transcribe(baseInput)).rejects.toThrow(
        "mlx-audio transcription failed",
      );
    });

    // NDJSON parsing
    it("parses single NDJSON line with accumulated field", async () => {
      mockFetch.queueTextResponse('{"text":"hi","accumulated":"hi"}');
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("hi");
    });

    it("returns last accumulated value from multiple NDJSON lines", async () => {
      mockFetch.queueTextResponse(
        '{"text":"hello","accumulated":"hello"}\n{"text":" world","accumulated":"hello world"}',
      );
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("hello world");
    });

    it("concatenates text fields when accumulated is missing", async () => {
      mockFetch.queueTextResponse('{"text":"hello"}\n{"text":" world"}');
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("hello world");
    });

    it("returns empty text for empty response", async () => {
      mockFetch.queueTextResponse("");
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("");
    });

    it("handles single JSON object with text field", async () => {
      mockFetch.queueTextResponse('{"text":"single line"}');
      const result = await client.transcribe(baseInput);
      // This parses as NDJSON with one line — accumulated is undefined, text is concatenated
      expect(result.text).toBe("single line");
    });

    it("returns trimmed raw text for non-JSON response", async () => {
      mockFetch.queueTextResponse("  plain text transcription  ");
      const result = await client.transcribe(baseInput);
      expect(result.text).toBe("plain text transcription");
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
        "http://127.0.0.1:9100/v1/audio/speech",
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

    it('maps "format" to "response_format"', async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio-data"));
      await client.synthesize({ model: "m", text: "t", format: "wav" });
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.response_format).toBe("wav");
    });

    it("includes voice, speed, instruct only when provided", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("a"));
      await client.synthesize({ model: "m", text: "t" });
      const body1 = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body1.voice).toBeUndefined();
      expect(body1.speed).toBeUndefined();
      expect(body1.instruct).toBeUndefined();

      mockFetch.queueBinaryResponse(Buffer.from("a"));
      await client.synthesize({
        model: "m",
        text: "t",
        voice: "v",
        speed: 1.5,
        instruct: "happy",
      });
      const body2 = JSON.parse(mockFetch.calls[1]!.init?.body as string);
      expect(body2.voice).toBe("v");
      expect(body2.speed).toBe(1.5);
      expect(body2.instruct).toBe("happy");
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
      ).rejects.toThrow("mlx-audio speech synthesis failed");
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
      ).rejects.toThrow("mlx-audio streaming speech synthesis failed");
    });
  });
});
