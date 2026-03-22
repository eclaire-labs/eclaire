/**
 * Pocket TTS HTTP Client
 *
 * Typed HTTP client for the pocket-tts server (Kyutai Labs) REST API.
 *
 * pocket-tts endpoints:
 *   GET  /health   → server alive check
 *   POST /tts      → TTS (multipart/form-data → streaming WAV)
 */

export interface PocketTtsClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Low-level HTTP client for the pocket-tts server.
 *
 * All methods throw on network/HTTP errors — callers handle error mapping.
 */
export class PocketTtsClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: PocketTtsClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs;
  }

  /**
   * Check if the server is alive.
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.fetch("/health");
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Synthesize speech via POST /tts.
   *
   * pocket-tts expects multipart/form-data with `text` and optional `voice_url`.
   * Returns the raw WAV audio buffer.
   */
  async synthesize(input: { text: string; voice?: string }): Promise<Buffer> {
    const response = await this.postTts(input);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `pocket-tts synthesis failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Synthesize speech with streaming via POST /tts.
   *
   * Returns the raw Response so the caller can stream the body.
   * pocket-tts always returns a StreamingResponse with WAV audio.
   */
  async synthesizeStream(input: {
    text: string;
    voice?: string;
  }): Promise<Response> {
    const response = await this.postTts(input);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `pocket-tts streaming synthesis failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    return response;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async postTts(input: {
    text: string;
    voice?: string;
  }): Promise<Response> {
    const formData = new FormData();
    formData.append("text", input.text);
    if (input.voice) {
      formData.append("voice_url", input.voice);
    }

    return this.fetch("/tts", {
      method: "POST",
      body: formData,
    });
  }

  private async fetch(urlPath: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${urlPath}`;
    return globalThis.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}
