/**
 * MLX Audio Provider
 *
 * Implements AudioProvider using the mlx-audio REST server.
 * Applies default model/voice from config and translates between
 * our clean types and the mlx-audio wire format.
 */

import { MlxAudioClient, readAudioFile } from "./mlx-client.js";
import type {
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderConfig,
  AudioProviderHealth,
  AudioProviderId,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
} from "./types.js";

export class MlxAudioProvider implements AudioProvider {
  readonly providerId: AudioProviderId = "mlx-audio";
  readonly capabilities: AudioProviderCapabilities = {
    stt: true,
    tts: true,
    streamingStt: true,
    streamingTts: true,
  };

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
    let voice = input.voice ?? (this.config.defaultTtsVoice || undefined);
    // VibeVoice requires an explicit voice cache — default to en-Emma_woman
    if (!voice && model?.toLowerCase().includes("vibevoice")) {
      voice = "en-Emma_woman";
    }
    const format = input.format ?? "mp3";

    const buffer = await this.client.synthesize({
      model,
      text: input.text,
      voice,
      speed: input.speed,
      format,
      instruct: input.instruct,
    });

    return buffer;
  }

  async synthesizeStream(input: SynthesizeInput): Promise<Response> {
    const model = input.model ?? this.config.defaultTtsModel;
    let voice = input.voice ?? (this.config.defaultTtsVoice || undefined);
    // VibeVoice requires an explicit voice cache — default to en-Emma_woman
    if (!voice && model?.toLowerCase().includes("vibevoice")) {
      voice = "en-Emma_woman";
    }
    const format = input.format ?? "wav";

    return this.client.synthesizeStream({
      model,
      text: input.text,
      voice,
      speed: input.speed,
      format,
      instruct: input.instruct,
    });
  }

  async checkHealth(): Promise<AudioProviderHealth> {
    try {
      const alive = await this.client.ping();
      if (!alive) {
        return {
          providerId: this.providerId,
          status: "unavailable",
          capabilities: this.capabilities,
        };
      }

      return {
        providerId: this.providerId,
        status: "ready",
        capabilities: this.capabilities,
        defaults: {
          sttModel: this.config.defaultSttModel,
          ttsModel: this.config.defaultTtsModel,
          ttsVoice: this.config.defaultTtsVoice,
        },
      };
    } catch {
      return {
        providerId: this.providerId,
        status: "unavailable",
        capabilities: this.capabilities,
      };
    }
  }
}
