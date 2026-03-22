/**
 * ElevenLabs Audio Provider
 *
 * Implements AudioProvider using the ElevenLabs REST API.
 * Supports batch STT, buffered TTS, and streaming TTS.
 * Does NOT support streaming STT (realtime WebSocket).
 */

import { readAudioFile } from "./mlx-client.js";
import { ElevenLabsClient } from "./elevenlabs-client.js";
import type {
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderHealth,
  AudioProviderId,
  ElevenLabsProviderConfig,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
} from "./types.js";

/**
 * Map our simple format names to ElevenLabs output format strings.
 * mp3 → high quality MP3, wav → raw PCM 16kHz (for streaming playback compatibility).
 */
function toElevenLabsFormat(format: "mp3" | "wav"): string {
  return format === "wav" ? "pcm_16000" : "mp3_44100_128";
}

export class ElevenLabsProvider implements AudioProvider {
  readonly providerId: AudioProviderId = "elevenlabs";
  readonly capabilities: AudioProviderCapabilities = {
    stt: true,
    tts: true,
    streamingStt: false,
    streamingTts: true,
  };

  private readonly client: ElevenLabsClient;
  private readonly config: ElevenLabsProviderConfig;

  constructor(config: ElevenLabsProviderConfig) {
    this.config = config;
    this.client = new ElevenLabsClient({
      apiKey: config.apiKey,
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

    const result = await this.client.transcribe({
      file,
      fileName,
      model,
    });

    return result;
  }

  async synthesize(input: SynthesizeInput): Promise<Buffer> {
    const modelId = input.model ?? this.config.defaultTtsModel;
    const voiceId = input.voice ?? this.config.defaultTtsVoice;
    const format = input.format ?? "mp3";

    if (!voiceId) {
      throw new Error(
        "ElevenLabs requires a voice ID. Set a default voice or pass one in the request.",
      );
    }

    return this.client.synthesize({
      text: input.text,
      voiceId,
      modelId,
      speed: input.speed,
      outputFormat: toElevenLabsFormat(format),
    });
  }

  async synthesizeStream(input: SynthesizeInput): Promise<Response> {
    const modelId = input.model ?? this.config.defaultTtsModel;
    const voiceId = input.voice ?? this.config.defaultTtsVoice;
    const format = input.format ?? "wav";

    if (!voiceId) {
      throw new Error(
        "ElevenLabs requires a voice ID. Set a default voice or pass one in the request.",
      );
    }

    return this.client.synthesizeStream({
      text: input.text,
      voiceId,
      modelId,
      speed: input.speed,
      outputFormat: toElevenLabsFormat(format),
    });
  }

  async checkHealth(): Promise<AudioProviderHealth> {
    try {
      const valid = await this.client.checkSubscription();
      if (!valid) {
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
