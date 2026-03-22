/**
 * ElevenLabs HTTP Client
 *
 * Typed HTTP client for the ElevenLabs REST API.
 *
 * ElevenLabs endpoints:
 *   GET  /v1/user/subscription       → check API key validity
 *   POST /v1/speech-to-text          → STT (multipart form)
 *   POST /v1/text-to-speech/{voice}  → TTS (JSON → binary audio)
 *   POST /v1/text-to-speech/{voice}/stream → TTS streaming
 */

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";

export interface ElevenLabsClientConfig {
  apiKey: string;
  timeoutMs: number;
}

/**
 * Low-level HTTP client for the ElevenLabs API.
 *
 * All methods throw on network/HTTP errors — callers handle error mapping.
 */
export class ElevenLabsClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(config: ElevenLabsClientConfig) {
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs;
  }

  /**
   * Check if the API key is valid by hitting the subscription endpoint.
   */
  async checkSubscription(): Promise<boolean> {
    try {
      const response = await this.fetch("/v1/user/subscription");
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Transcribe audio via POST /v1/speech-to-text.
   */
  async transcribe(input: {
    file: Buffer;
    fileName: string;
    model: string;
  }): Promise<{ text: string }> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(input.file)]);
    formData.append("audio", blob, input.fileName);
    formData.append("model_id", input.model);

    const response = await this.fetch("/v1/speech-to-text", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `ElevenLabs transcription failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    return { text: typeof data.text === "string" ? data.text : "" };
  }

  /**
   * Synthesize speech via POST /v1/text-to-speech/{voiceId}.
   *
   * Returns the raw audio buffer.
   */
  async synthesize(input: {
    text: string;
    voiceId: string;
    modelId: string;
    speed?: number;
    outputFormat: string;
  }): Promise<Buffer> {
    const body: Record<string, unknown> = {
      text: input.text,
      model_id: input.modelId,
    };
    if (input.speed !== undefined && input.speed !== 1.0) {
      body.voice_settings = { speed: input.speed };
    }

    const response = await this.fetch(
      `/v1/text-to-speech/${input.voiceId}?output_format=${input.outputFormat}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `ElevenLabs speech synthesis failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Synthesize speech via POST /v1/text-to-speech/{voiceId}/stream.
   *
   * Returns the raw Response so the caller can stream the body.
   */
  async synthesizeStream(input: {
    text: string;
    voiceId: string;
    modelId: string;
    speed?: number;
    outputFormat: string;
  }): Promise<Response> {
    const body: Record<string, unknown> = {
      text: input.text,
      model_id: input.modelId,
    };
    if (input.speed !== undefined && input.speed !== 1.0) {
      body.voice_settings = { speed: input.speed };
    }

    const response = await this.fetch(
      `/v1/text-to-speech/${input.voiceId}/stream?output_format=${input.outputFormat}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `ElevenLabs streaming synthesis failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    return response;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async fetch(urlPath: string, init?: RequestInit): Promise<Response> {
    const url = `${ELEVENLABS_BASE_URL}${urlPath}`;
    return globalThis.fetch(url, {
      ...init,
      headers: {
        "xi-api-key": this.apiKey,
        ...(init?.headers as Record<string, string>),
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}
