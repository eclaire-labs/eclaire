/**
 * oMLX Audio Provider
 *
 * Implements AudioProvider using the oMLX server's audio endpoints.
 * oMLX is a unified inference server for Apple Silicon that serves
 * LLM, vision, TTS, and STT from a single process.
 *
 * Maps Eclaire's SynthesizeInput.instruct → oMLX's "instructions" field.
 */

import { readAudioFile } from "./mlx-client.js";
import { OmlxAudioClient } from "./omlx-client.js";
import type {
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderHealth,
  AudioProviderId,
  OmlxAudioProviderConfig,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
} from "./types.js";

export class OmlxAudioProvider implements AudioProvider {
  readonly providerId: AudioProviderId = "omlx";
  readonly capabilities: AudioProviderCapabilities = {
    stt: true,
    tts: true,
    streamingStt: false,
    streamingTts: true,
  };

  private readonly client: OmlxAudioClient;
  private readonly config: OmlxAudioProviderConfig;

  constructor(config: OmlxAudioProviderConfig) {
    this.config = config;
    this.client = new OmlxAudioClient({
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

  async synthesizeStream(input: SynthesizeInput): Promise<Response> {
    const model = input.model ?? this.config.defaultTtsModel;
    const voice = input.voice ?? (this.config.defaultTtsVoice || undefined);
    const format = input.format ?? "wav";

    return this.client.synthesizeStream({
      model,
      text: input.text,
      voice,
      speed: input.speed,
      format,
      instructions: input.instruct,
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
