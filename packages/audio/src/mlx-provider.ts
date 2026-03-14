/**
 * MLX Audio Provider
 *
 * Implements AudioProvider using the mlx-audio REST server.
 * Applies default model/voice from config and translates between
 * our clean types and the mlx-audio wire format.
 */

import { MlxAudioClient, readAudioFile } from "./mlx-client.js";
import type {
  AudioHealth,
  AudioProvider,
  AudioProviderConfig,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
} from "./types.js";

export class MlxAudioProvider implements AudioProvider {
  private readonly client: MlxAudioClient;
  private readonly config: AudioProviderConfig;

  constructor(config: AudioProviderConfig) {
    this.config = config;
    this.client = new MlxAudioClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeoutMs,
    });
  }

  async transcribe(input: TranscribeInput): Promise<TranscriptionResult> {
    // Resolve file to Buffer
    let file: Buffer;
    let fileName: string;

    if (typeof input.file === "string") {
      const read = readAudioFile(input.file);
      file = read.file;
      fileName = input.fileName ?? read.fileName;
    } else {
      file = input.file;
      fileName = input.fileName ?? "audio.wav";
    }

    const model = input.model ?? this.config.defaultSttModel;

    // model, fileName, language logged at service layer if needed

    const result = await this.client.transcribe({
      file,
      fileName,
      model,
      language: input.language,
    });

    return result;
  }

  async synthesize(input: SynthesizeInput): Promise<Buffer> {
    const model = input.model ?? this.config.defaultTtsModel;
    const voice = input.voice ?? (this.config.defaultTtsVoice || undefined);
    const format = input.format ?? "mp3";

    const buffer = await this.client.synthesize({
      model,
      text: input.text,
      voice,
      speed: input.speed,
      format,
    });

    return buffer;
  }

  async checkHealth(): Promise<AudioHealth> {
    try {
      const alive = await this.client.ping();
      if (!alive) {
        return { status: "unavailable" };
      }

      const modelsResponse = await this.client.listModels();
      return {
        status: "ready",
        models: modelsResponse.data.map((m) => ({ id: m.id })),
      };
    } catch {
      return { status: "unavailable" };
    }
  }
}
