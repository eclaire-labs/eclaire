/**
 * Whisper.cpp HTTP Client
 *
 * Typed HTTP client for the whisper-cpp server REST API.
 *
 * whisper-cpp endpoints:
 *   GET  /                     → server alive check
 *   POST /inference            → STT (multipart form)
 */

export interface WhisperCppClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Low-level HTTP client for the whisper-cpp server.
 *
 * All methods throw on network/HTTP errors — callers handle error mapping.
 */
export class WhisperCppClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: WhisperCppClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs;
  }

  /**
   * Check if the server is alive by hitting the root endpoint.
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.fetch("/");
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Transcribe audio via POST /inference.
   */
  async transcribe(input: {
    file: Buffer;
    fileName: string;
    language?: string;
  }): Promise<{ text: string }> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(input.file)]);
    formData.append("file", blob, input.fileName);
    formData.append("response_format", "json");
    if (input.language) {
      formData.append("language", input.language);
    }

    const response = await this.fetch("/inference", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `whisper-cpp transcription failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    return { text: typeof data.text === "string" ? data.text : "" };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async fetch(urlPath: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${urlPath}`;
    return globalThis.fetch(url, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}
