/**
 * MLX Audio HTTP Client
 *
 * Typed HTTP client for the mlx-audio REST API. Handles the wire protocol
 * differences between our clean types and the mlx-audio OpenAI-compatible API.
 *
 * mlx-audio endpoints:
 *   GET  /              → server alive check
 *   GET  /v1/models     → list loaded models
 *   POST /v1/audio/transcriptions → STT (multipart form)
 *   POST /v1/audio/speech         → TTS (JSON → binary audio)
 */

import fs from "node:fs";
import path from "node:path";

export interface MlxClientConfig {
  baseUrl: string;
  timeoutMs: number;
}

export interface MlxModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

export interface MlxModelsResponse {
  object: "list";
  data: MlxModel[];
}

/**
 * Low-level HTTP client for the mlx-audio server.
 *
 * All methods throw on network/HTTP errors — callers handle error mapping.
 */
export class MlxAudioClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: MlxClientConfig) {
    // Strip trailing slash
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
   * List loaded models.
   */
  async listModels(): Promise<MlxModelsResponse> {
    const response = await this.fetch("/v1/models");
    if (!response.ok) {
      throw new Error(
        `mlx-audio /v1/models failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as MlxModelsResponse;
  }

  /**
   * Transcribe audio via POST /v1/audio/transcriptions.
   *
   * The mlx-audio server returns NDJSON lines with { text, accumulated }.
   * We parse all lines and return the final accumulated text.
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
        `mlx-audio transcription failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    // mlx-audio returns NDJSON (newline-delimited JSON) for transcriptions.
    // Each line is a JSON object with { text, accumulated }.
    // The final accumulated value contains the complete transcription.
    const responseText = await response.text();
    return this.parseNdjsonTranscription(responseText);
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
  }): Promise<Buffer> {
    const body: Record<string, unknown> = {
      model: input.model,
      input: input.text, // mlx-audio uses "input" not "text"
    };
    if (input.voice) body.voice = input.voice;
    if (input.speed !== undefined) body.speed = input.speed;
    if (input.format) body.response_format = input.format; // mlx-audio uses "response_format"

    const response = await this.fetch("/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `mlx-audio speech synthesis failed: ${response.status} ${response.statusText}${errorText ? ` — ${errorText}` : ""}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
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

  /**
   * Parse NDJSON transcription response.
   *
   * mlx-audio returns lines like:
   *   {"text": "partial", "accumulated": "partial"}
   *   {"text": " more", "accumulated": "partial more"}
   *
   * We want the last `accumulated` value, falling back to concatenating `text`.
   */
  private parseNdjsonTranscription(responseText: string): { text: string } {
    const lines = responseText
      .split("\n")
      .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
      return { text: "" };
    }

    // Try to parse as NDJSON (multiple JSON objects, one per line)
    let lastAccumulated: string | undefined;
    let concatenated = "";

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;

        if (typeof parsed.accumulated === "string") {
          lastAccumulated = parsed.accumulated;
        }
        if (typeof parsed.text === "string") {
          concatenated += parsed.text;
        }
      } catch {
        // If a line isn't valid JSON, the response might be a single JSON object
        // Try parsing the entire response as one JSON object
        try {
          const parsed = JSON.parse(responseText) as Record<string, unknown>;
          if (typeof parsed.text === "string") {
            return { text: parsed.text };
          }
        } catch {
          // Not JSON at all — return raw text
          return { text: responseText.trim() };
        }
      }
    }

    return { text: lastAccumulated ?? concatenated };
  }
}

/**
 * Read a file from disk into a Buffer with its filename.
 */
export function readAudioFile(filePath: string): {
  file: Buffer;
  fileName: string;
} {
  const file = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  return { file, fileName };
}
