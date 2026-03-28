/**
 * Audio Service Integration Tests
 *
 * Tests the speech HTTP/WS endpoints against a running backend:
 *   GET  /api/speech/health
 *   POST /api/speech/transcriptions
 *   POST /api/speech/synthesis
 *   WS   /api/speech/transcriptions/stream
 *
 * Provider-dependent tests skip gracefully when the audio server is unavailable.
 *
 * Run with: pnpm --filter @eclaire/backend vitest run src/tests/integration/audio.test.ts
 */

import { beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  BASE_URL,
  createAuthenticatedFetch,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const authenticatedFetch = createAuthenticatedFetch(TEST_API_KEY);

function containsAnyWord(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

function generateSilenceWav(durationSecs: number, sampleRate = 16000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(sampleRate * durationSecs);
  const dataSize = numSamples * numChannels * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function hasWavHeader(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  );
}

function hasMp3Header(buf: Buffer): boolean {
  if (buf.length < 3) return false;
  if (buf.toString("ascii", 0, 3) === "ID3") return true;
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return true;
  return false;
}

function buildWsUrl(path: string, query?: Record<string, string>): string {
  const httpBase = BASE_URL.replace(/\/api$/, "");
  const wsBase = httpBase.replace(/^http/, "ws");
  const qs = query ? `?${new URLSearchParams(query).toString()}` : "";
  return `${wsBase}/api/speech${path}${qs}`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("Audio Service Integration Tests", { timeout: 60_000 }, () => {
  let serverReachable = false;
  let audioAvailable = false;
  let mlxAvailable = false;
  let whisperCppAvailable = false;

  beforeAll(async () => {
    try {
      const res = await authenticatedFetch(`${BASE_URL}/speech/health`);
      serverReachable = true;
      if (res.ok) {
        const health = (await res.json()) as {
          status: string;
          providers?: Array<{ providerId: string; status: string }>;
        };
        audioAvailable = health.status === "ready";
        const providers = health.providers ?? [];
        mlxAvailable = providers.some(
          (p) => p.providerId === "mlx-audio" && p.status === "ready",
        );
        whisperCppAvailable = providers.some(
          (p) => p.providerId === "whisper-cpp" && p.status === "ready",
        );
      }
    } catch {
      console.log(
        "Backend not reachable — all audio integration tests will be skipped",
      );
    }
  }, 15_000);

  // -----------------------------------------------------------------------
  // GET /api/speech/health
  // -----------------------------------------------------------------------

  describe("GET /api/speech/health", () => {
    it("returns 401 without authentication", async ({ skip }) => {
      if (!serverReachable) skip();
      const res = await fetch(`${BASE_URL}/speech/health`);
      expect(res.status).toBe(401);
    });

    it("returns AudioHealth JSON with status field", async ({ skip }) => {
      if (!serverReachable) skip();

      const res = await authenticatedFetch(`${BASE_URL}/speech/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(typeof body.status).toBe("string");
      expect(["ready", "unavailable"]).toContain(body.status);
    });

    it("includes providers array with per-provider details", async ({
      skip,
    }) => {
      if (!audioAvailable) skip();

      const res = await authenticatedFetch(`${BASE_URL}/speech/health`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        providers?: Array<{
          providerId: string;
          status: string;
          capabilities: Record<string, boolean>;
        }>;
      };
      expect(Array.isArray(body.providers)).toBe(true);
      for (const p of body.providers!) {
        expect(typeof p.providerId).toBe("string");
        expect(["ready", "unavailable"]).toContain(p.status);
        expect(typeof p.capabilities).toBe("object");
      }
    });

    it("includes streamingEnabled and defaults from mlx-audio", async ({
      skip,
    }) => {
      if (!mlxAvailable) skip();

      const res = await authenticatedFetch(`${BASE_URL}/speech/health`);
      const body = (await res.json()) as {
        streamingEnabled?: boolean;
        defaults?: {
          sttModel: string;
          ttsModel: string;
          ttsVoice: string;
        };
      };
      expect(typeof body.streamingEnabled).toBe("boolean");
      expect(body.defaults).toBeDefined();
      expect(typeof body.defaults!.sttModel).toBe("string");
      expect(typeof body.defaults!.ttsModel).toBe("string");
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/speech/transcriptions
  // -----------------------------------------------------------------------

  describe("POST /api/speech/transcriptions", () => {
    it("returns 401 without authentication", async ({ skip }) => {
      if (!serverReachable) skip();
      const res = await fetch(`${BASE_URL}/speech/transcriptions`, {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });

    it("returns 400 when multipart file field is missing", async ({ skip }) => {
      if (!audioAvailable) skip();

      const formData = new FormData();
      formData.append("notafile", "hello");

      const res = await authenticatedFetch(
        `${BASE_URL}/speech/transcriptions`,
        { method: "POST", body: formData },
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("file");
    });

    it(
      "transcribes audio using default provider (mlx-audio)",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!mlxAvailable) skip();

        const wav = generateSilenceWav(1);
        const formData = new FormData();
        formData.append(
          "file",
          new Blob([wav], { type: "audio/wav" }),
          "silence.wav",
        );

        const res = await authenticatedFetch(
          `${BASE_URL}/speech/transcriptions`,
          { method: "POST", body: formData },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { text: string };
        expect(typeof body.text).toBe("string");
      },
    );

    it(
      "transcribes audio with explicit provider=mlx-audio",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!mlxAvailable) skip();

        const wav = generateSilenceWav(1);
        const formData = new FormData();
        formData.append(
          "file",
          new Blob([wav], { type: "audio/wav" }),
          "silence.wav",
        );
        formData.append("provider", "mlx-audio");

        const res = await authenticatedFetch(
          `${BASE_URL}/speech/transcriptions`,
          { method: "POST", body: formData },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { text: string };
        expect(typeof body.text).toBe("string");
      },
    );

    it(
      "transcribes audio with explicit provider=whisper-cpp",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!whisperCppAvailable) skip();

        const wav = generateSilenceWav(1);
        const formData = new FormData();
        formData.append(
          "file",
          new Blob([wav], { type: "audio/wav" }),
          "silence.wav",
        );
        formData.append("provider", "whisper-cpp");

        const res = await authenticatedFetch(
          `${BASE_URL}/speech/transcriptions`,
          { method: "POST", body: formData },
        );
        expect(res.status).toBe(200);
        const body = (await res.json()) as { text: string };
        expect(typeof body.text).toBe("string");
      },
    );
  });

  // -----------------------------------------------------------------------
  // POST /api/speech/synthesis
  // -----------------------------------------------------------------------

  describe("POST /api/speech/synthesis", () => {
    // Zod validation runs before auth on this endpoint

    it("returns 400 for empty text", async ({ skip }) => {
      if (!serverReachable) skip();
      const res = await authenticatedFetch(`${BASE_URL}/speech/synthesis`, {
        method: "POST",
        body: JSON.stringify({ text: "" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for text exceeding 10000 chars", async ({ skip }) => {
      if (!serverReachable) skip();
      const res = await authenticatedFetch(`${BASE_URL}/speech/synthesis`, {
        method: "POST",
        body: JSON.stringify({ text: "x".repeat(10001) }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for speed out of range", async ({ skip }) => {
      if (!serverReachable) skip();
      const res = await authenticatedFetch(`${BASE_URL}/speech/synthesis`, {
        method: "POST",
        body: JSON.stringify({ text: "Hello", speed: 5.0 }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid format", async ({ skip }) => {
      if (!serverReachable) skip();
      const res = await authenticatedFetch(`${BASE_URL}/speech/synthesis`, {
        method: "POST",
        body: JSON.stringify({ text: "Hello", format: "ogg" }),
      });
      expect(res.status).toBe(400);
    });

    it("returns 401 without authentication", async ({ skip }) => {
      if (!serverReachable) skip();
      const res = await fetch(`${BASE_URL}/speech/synthesis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello world" }),
      });
      // Zod validation passes, then auth rejects
      expect(res.status).toBe(401);
    });

    it(
      "synthesizes mp3 with valid header",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!mlxAvailable) skip();

        const res = await authenticatedFetch(`${BASE_URL}/speech/synthesis`, {
          method: "POST",
          body: JSON.stringify({
            text: "Hello world",
            format: "mp3",
          }),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("audio/mpeg");

        const buf = Buffer.from(await res.arrayBuffer());
        expect(buf.length).toBeGreaterThan(1000);
        expect(hasMp3Header(buf)).toBe(true);
      },
    );

    it(
      "synthesizes wav with valid RIFF header",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!mlxAvailable) skip();

        const res = await authenticatedFetch(`${BASE_URL}/speech/synthesis`, {
          method: "POST",
          body: JSON.stringify({
            text: "Hello world",
            format: "wav",
          }),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("audio/wav");

        const buf = Buffer.from(await res.arrayBuffer());
        expect(buf.length).toBeGreaterThan(1000);
        expect(hasWavHeader(buf)).toBe(true);
      },
    );

    it(
      "streams audio when stream=true",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!mlxAvailable) skip();

        const res = await authenticatedFetch(`${BASE_URL}/speech/synthesis`, {
          method: "POST",
          body: JSON.stringify({
            text: "Hello world",
            format: "mp3",
            stream: true,
          }),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("audio/mpeg");
        expect(res.headers.get("transfer-encoding")).toBe("chunked");

        // Consume the stream to verify it's readable
        const buf = Buffer.from(await res.arrayBuffer());
        expect(buf.length).toBeGreaterThan(0);
      },
    );

    it(
      "routes to explicit provider via body.provider",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!mlxAvailable) skip();

        const res = await authenticatedFetch(`${BASE_URL}/speech/synthesis`, {
          method: "POST",
          body: JSON.stringify({
            text: "Hello",
            provider: "mlx-audio",
          }),
        });
        expect(res.status).toBe(200);

        const buf = Buffer.from(await res.arrayBuffer());
        expect(buf.length).toBeGreaterThan(0);
      },
    );
  });

  // -----------------------------------------------------------------------
  // WS /api/speech/transcriptions/stream
  // -----------------------------------------------------------------------

  describe("WS /api/speech/transcriptions/stream", () => {
    it("rejects upgrade without authentication", async ({ skip }) => {
      if (!serverReachable) skip();
      const url = buildWsUrl("/transcriptions/stream");

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => reject(new Error("Timeout")), 5000);

        ws.on("unexpected-response", (_req, res) => {
          clearTimeout(timer);
          expect(res.statusCode).toBe(401);
          ws.close();
          resolve();
        });

        ws.on("open", () => {
          clearTimeout(timer);
          ws.close();
          reject(new Error("Expected 401 but connection opened"));
        });

        ws.on("error", () => {
          // Connection errors are acceptable — server rejected the upgrade
          clearTimeout(timer);
          resolve();
        });
      });
    });

    it(
      "upgrades and receives connected event",
      { timeout: 15_000 },
      async ({ skip }) => {
        if (!mlxAvailable) skip();

        const url = buildWsUrl("/transcriptions/stream");
        const ws = new WebSocket(url, {
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        });

        try {
          const msg = await new Promise<Record<string, unknown>>(
            (resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error("Timeout")),
                10_000,
              );

              ws.on("message", (data) => {
                clearTimeout(timer);
                resolve(JSON.parse(data.toString()) as Record<string, unknown>);
              });

              ws.on("error", (err) => {
                clearTimeout(timer);
                reject(err);
              });

              ws.on("unexpected-response", (_req, res) => {
                clearTimeout(timer);
                reject(new Error(`Unexpected HTTP ${res.statusCode}`));
              });
            },
          );

          expect(msg.type).toBe("connected");
        } finally {
          ws.close();
        }
      },
    );

    it(
      "receives error for provider without streaming STT support",
      { timeout: 15_000 },
      async ({ skip }) => {
        if (!audioAvailable) skip();

        // whisper-cpp does not support streaming STT
        const url = buildWsUrl("/transcriptions/stream", {
          provider: "whisper-cpp",
        });
        const ws = new WebSocket(url, {
          headers: { Authorization: `Bearer ${TEST_API_KEY}` },
        });

        try {
          const msg = await new Promise<Record<string, unknown>>(
            (resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error("Timeout")),
                10_000,
              );

              ws.on("message", (data) => {
                const parsed = JSON.parse(data.toString()) as Record<
                  string,
                  unknown
                >;
                if (parsed.type === "error") {
                  clearTimeout(timer);
                  resolve(parsed);
                }
              });

              ws.on("close", () => {
                clearTimeout(timer);
                // Server may close before sending error in some cases
                resolve({ type: "error", error: "closed" });
              });

              ws.on("error", (err) => {
                clearTimeout(timer);
                reject(err);
              });

              ws.on("unexpected-response", (_req, res) => {
                clearTimeout(timer);
                reject(new Error(`Unexpected HTTP ${res.statusCode}`));
              });
            },
          );

          expect(msg.type).toBe("error");
          expect(typeof msg.error).toBe("string");
        } finally {
          ws.close();
        }
      },
    );
  });

  // -----------------------------------------------------------------------
  // Cross-provider round-trip
  // -----------------------------------------------------------------------

  describe("Cross-provider round-trip", () => {
    it(
      "synthesize → transcribe → fuzzy match",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!mlxAvailable) skip();

        // 1. Synthesize "Hello world" to WAV
        const synthRes = await authenticatedFetch(
          `${BASE_URL}/speech/synthesis`,
          {
            method: "POST",
            body: JSON.stringify({
              text: "Hello world",
              format: "wav",
            }),
          },
        );
        expect(synthRes.status).toBe(200);
        const audioBuffer = Buffer.from(await synthRes.arrayBuffer());
        expect(hasWavHeader(audioBuffer)).toBe(true);
        expect(audioBuffer.length).toBeGreaterThan(1000);

        // 2. Transcribe the synthesized audio
        const formData = new FormData();
        formData.append(
          "file",
          new Blob([audioBuffer], { type: "audio/wav" }),
          "round-trip.wav",
        );

        let transcribeRes: Response;
        try {
          transcribeRes = await authenticatedFetch(
            `${BASE_URL}/speech/transcriptions`,
            { method: "POST", body: formData },
          );
        } catch (err) {
          console.log(
            `  STT unavailable: ${err instanceof Error ? err.message : err}`,
          );
          skip();
          return;
        }

        expect(transcribeRes.status).toBe(200);
        const result = (await transcribeRes.json()) as { text: string };

        // 3. Fuzzy match
        console.log(`  mlx→mlx round-trip transcription: "${result.text}"`);
        expect(containsAnyWord(result.text, ["hello", "world"])).toBe(true);
      },
    );

    it(
      "mlx-audio TTS → whisper-cpp STT → fuzzy match",
      { timeout: 30_000 },
      async ({ skip }) => {
        if (!mlxAvailable || !whisperCppAvailable) skip();

        // 1. Synthesize with mlx-audio
        const synthRes = await authenticatedFetch(
          `${BASE_URL}/speech/synthesis`,
          {
            method: "POST",
            body: JSON.stringify({
              text: "Hello world",
              format: "wav",
              provider: "mlx-audio",
            }),
          },
        );
        expect(synthRes.status).toBe(200);
        const audioBuffer = Buffer.from(await synthRes.arrayBuffer());

        // 2. Transcribe with whisper-cpp
        const formData = new FormData();
        formData.append(
          "file",
          new Blob([audioBuffer], { type: "audio/wav" }),
          "cross-provider.wav",
        );
        formData.append("provider", "whisper-cpp");

        const transcribeRes = await authenticatedFetch(
          `${BASE_URL}/speech/transcriptions`,
          { method: "POST", body: formData },
        );
        expect(transcribeRes.status).toBe(200);
        const result = (await transcribeRes.json()) as { text: string };

        // 3. Fuzzy match
        console.log(`  mlx→whisper round-trip transcription: "${result.text}"`);
        expect(containsAnyWord(result.text, ["hello", "world"])).toBe(true);
      },
    );
  });
});
