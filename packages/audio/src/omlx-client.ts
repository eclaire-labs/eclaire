/**
 * oMLX Audio HTTP Client
 *
 * Typed HTTP client for the oMLX server's audio endpoints. oMLX serves
 * LLM, vision, TTS, and STT from a single OpenAI-compatible API.
 *
 * Key differences from the mlx-audio client:
 *   - Health check: GET /health (not /)
 *   - STT response: single JSON {text, language, duration} (not NDJSON)
 *   - TTS field: "instructions" (not "instruct")
 *
 * oMLX audio endpoints:
 *   GET  /health                    → server alive check
 *   GET  /v1/models                 → list loaded models
 *   POST /v1/audio/transcriptions   → STT (multipart form)
 *   POST /v1/audio/speech           → TTS (JSON → binary audio)
 */

export interface OmlxClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

export class OmlxAudioClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OmlxClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs;
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.fetch("/health");
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<{ data: Array<{ id: string }> }> {
    const response = await this.fetch("/v1/models");
    if (!response.ok) {
      throw new Error(
        `oMLX /v1/models failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as { data: Array<{ id: string }> };
  }

  /**
   * Transcribe audio via POST /v1/audio/transcriptions.
   *
   * oMLX returns a single JSON object { text, language, duration, segments }.
   */
  async transcribe(input: {
    file: Buffer;
    fileName: string;
    model: string;
    language?: string;
  }): Promise<{ text: string }> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(input.file)]);
    formData.append("file", blob, input.fileName);
    formData.append("model", input.model);
    if (input.language) {
      formData.append("language", input.language);
    }

    const response = await this.fetch("/v1/audio/transcriptions", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `oMLX transcription failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    const result = (await response.json()) as { text: string };
    return { text: result.text ?? "" };
  }

  /**
   * Synthesize speech via POST /v1/audio/speech.
   *
   * Returns the raw audio buffer.
   */
  async synthesize(input: {
    model: string;
    text: string;
    voice?: string;
    speed?: number;
    format?: string;
    instructions?: string;
  }): Promise<Buffer> {
    const body: Record<string, unknown> = {
      model: input.model,
      input: input.text,
    };
    if (input.voice) body.voice = input.voice;
    if (input.speed !== undefined) body.speed = input.speed;
    if (input.format) body.response_format = input.format;
    if (input.instructions) body.instructions = input.instructions;

    const response = await this.fetch("/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `oMLX speech synthesis failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Synthesize speech via POST /v1/audio/speech with streaming.
   *
   * Returns the raw Response so the caller can stream the body.
   */
  async synthesizeStream(input: {
    model: string;
    text: string;
    voice?: string;
    speed?: number;
    format?: string;
    instructions?: string;
  }): Promise<Response> {
    const body: Record<string, unknown> = {
      model: input.model,
      input: input.text,
      stream: true,
    };
    if (input.voice) body.voice = input.voice;
    if (input.speed !== undefined) body.speed = input.speed;
    if (input.format) body.response_format = input.format;
    if (input.instructions) body.instructions = input.instructions;

    const response = await this.fetch("/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `oMLX streaming speech synthesis failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    return response;
  }

  private async fetch(urlPath: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${urlPath}`;
    return globalThis.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}
