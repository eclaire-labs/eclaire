import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsClient } from "../../elevenlabs-client.js";
import { createMockFetch, type MockFetchInstance } from "../setup.js";

describe("ElevenLabsClient", () => {
  let client: ElevenLabsClient;
  let mockFetch: MockFetchInstance;

  beforeEach(() => {
    mockFetch = createMockFetch();
    vi.stubGlobal("fetch", mockFetch.fetch);
    client = new ElevenLabsClient({ apiKey: "test-key-123", timeoutMs: 5000 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.reset();
  });

  // ---------------------------------------------------------------------------
  // auth header
  // ---------------------------------------------------------------------------

  describe("auth header", () => {
    it("includes xi-api-key header on all requests", async () => {
      mockFetch.queueJsonResponse({}, 200);
      await client.checkSubscription();
      const headers = mockFetch.calls[0]!.init?.headers as Record<
        string,
        string
      >;
      expect(headers["xi-api-key"]).toBe("test-key-123");
    });
  });

  // ---------------------------------------------------------------------------
  // checkSubscription
  // ---------------------------------------------------------------------------

  describe("checkSubscription", () => {
    it("returns true on 200", async () => {
      mockFetch.queueJsonResponse({}, 200);
      expect(await client.checkSubscription()).toBe(true);
      expect(mockFetch.calls[0]!.url).toContain("/v1/user/subscription");
    });

    it("returns false on 401", async () => {
      mockFetch.queueErrorResponse(401, "Unauthorized");
      expect(await client.checkSubscription()).toBe(false);
    });

    it("returns false on network error", async () => {
      mockFetch.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      expect(await client.checkSubscription()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // transcribe
  // ---------------------------------------------------------------------------

  describe("transcribe", () => {
    const baseInput = {
      file: Buffer.from("fake-audio"),
      fileName: "test.wav",
      model: "scribe_v1",
    };

    it("sends POST to /v1/speech-to-text", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      expect(mockFetch.calls[0]!.url).toContain("/v1/speech-to-text");
      expect(mockFetch.calls[0]!.init?.method).toBe("POST");
    });

    it('uses "audio" form field (not "file")', async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("audio")).toBeTruthy();
      expect(body.get("file")).toBeNull();
    });

    it("includes model_id in form data", async () => {
      mockFetch.queueJsonResponse({ text: "hello" });
      await client.transcribe(baseInput);
      const body = mockFetch.calls[0]!.init?.body as FormData;
      expect(body.get("model_id")).toBe("scribe_v1");
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
        "ElevenLabs transcription failed",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesize
  // ---------------------------------------------------------------------------

  describe("synthesize", () => {
    const baseInput = {
      text: "Hello",
      voiceId: "voice-1",
      modelId: "eleven_v2",
      outputFormat: "mp3_44100_128",
    };

    it("sends POST to /v1/text-to-speech/{voiceId}", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize(baseInput);
      expect(mockFetch.calls[0]!.url).toContain("/v1/text-to-speech/voice-1");
    });

    it("includes output_format as query parameter", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize(baseInput);
      expect(mockFetch.calls[0]!.url).toContain("output_format=mp3_44100_128");
    });

    it("includes model_id in JSON body", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize(baseInput);
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.model_id).toBe("eleven_v2");
      expect(body.text).toBe("Hello");
    });

    it("omits voice_settings when speed is undefined", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize(baseInput);
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.voice_settings).toBeUndefined();
    });

    it("omits voice_settings when speed is 1.0", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize({ ...baseInput, speed: 1.0 });
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.voice_settings).toBeUndefined();
    });

    it("includes voice_settings.speed when speed is not 1.0", async () => {
      mockFetch.queueBinaryResponse(Buffer.from("audio"));
      await client.synthesize({ ...baseInput, speed: 1.5 });
      const body = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(body.voice_settings).toEqual({ speed: 1.5 });
    });

    it("returns Buffer from arrayBuffer response", async () => {
      mockFetch.queueBinaryResponse(Buffer.from([1, 2, 3]));
      const result = await client.synthesize(baseInput);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBe(3);
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(client.synthesize(baseInput)).rejects.toThrow(
        "ElevenLabs speech synthesis failed",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesizeStream
  // ---------------------------------------------------------------------------

  describe("synthesizeStream", () => {
    const baseInput = {
      text: "Hello",
      voiceId: "voice-1",
      modelId: "eleven_v2",
      outputFormat: "pcm_16000",
    };

    it("sends POST to /v1/text-to-speech/{voiceId}/stream", async () => {
      mockFetch.queueResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        body: null,
      });
      await client.synthesizeStream(baseInput);
      expect(mockFetch.calls[0]!.url).toContain(
        "/v1/text-to-speech/voice-1/stream",
      );
    });

    it("returns raw Response on success", async () => {
      const mockBody = new ReadableStream<Uint8Array>();
      mockFetch.queueResponse({
        ok: true,
        status: 200,
        statusText: "OK",
        body: mockBody,
      });
      const result = await client.synthesizeStream(baseInput);
      expect(result.body).toBe(mockBody);
    });

    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");
      await expect(client.synthesizeStream(baseInput)).rejects.toThrow(
        "ElevenLabs streaming synthesis failed",
      );
    });
  });
});
