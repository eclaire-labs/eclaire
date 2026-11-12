/** STT/TTS provider for Rapid-MLX with its optional audio runtime installed. */

import { readAudioFile } from "./mlx-client.js";
import { RapidMlxAudioClient } from "./rapid-mlx-client.js";
import type {
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderHealth,
  AudioProviderId,
  RapidMlxAudioProviderConfig,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
} from "./types.js";

export class RapidMlxAudioProvider implements AudioProvider {
  readonly providerId: AudioProviderId = "rapid-mlx";
  readonly capabilities: AudioProviderCapabilities = {
    stt: true,
    tts: true,
    streamingStt: false,
    streamingTts: false,
  };

  private readonly client: RapidMlxAudioClient;
  private readonly config: RapidMlxAudioProviderConfig;

  constructor(config: RapidMlxAudioProviderConfig) {
    this.config = config;
    this.client = new RapidMlxAudioClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeoutMs,
    });
  }

  async transcribe(input: TranscribeInput): Promise<TranscriptionResult> {
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

    return this.client.transcribe({
      file,
      fileName,
      model,
      language: input.language,
    });
  }

  async synthesize(input: SynthesizeInput): Promise<Buffer> {
    const model = input.model ?? this.config.defaultTtsModel;
    const voice = input.voice ?? (this.config.defaultTtsVoice || undefined);
    const format = input.format ?? "wav";

    return this.client.synthesize({
      model,
      text: input.text,
      voice,
      speed: input.speed,
      format,
      instructions: input.instruct,
    });
  }

  async synthesizeStream(_input: SynthesizeInput): Promise<Response> {
    throw new Error("Rapid-MLX does not support streaming speech synthesis");
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
