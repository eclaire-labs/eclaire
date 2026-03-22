/**
 * Pocket TTS Audio Provider
 *
 * Implements AudioProvider using a local pocket-tts server.
 * Supports TTS only (no STT), with streaming support.
 */

import { PocketTtsClient } from "./pocket-tts-client.js";
import type {
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderHealth,
  AudioProviderId,
  PocketTtsProviderConfig,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
} from "./types.js";

export class PocketTtsProvider implements AudioProvider {
  readonly providerId: AudioProviderId = "pocket-tts";
  readonly capabilities: AudioProviderCapabilities = {
    stt: false,
    tts: true,
    streamingStt: false,
    streamingTts: true,
  };

  private readonly client: PocketTtsClient;
  private readonly config: PocketTtsProviderConfig;

  constructor(config: PocketTtsProviderConfig) {
    this.config = config;
    this.client = new PocketTtsClient({
      baseUrl: config.baseUrl,
      timeoutMs: config.requestTimeoutMs,
    });
  }

  async transcribe(_input: TranscribeInput): Promise<TranscriptionResult> {
    throw new Error("pocket-tts does not support speech-to-text");
  }

  async synthesize(input: SynthesizeInput): Promise<Buffer> {
    const voice = input.voice ?? (this.config.defaultTtsVoice || undefined);

    return this.client.synthesize({
      text: input.text,
      voice,
    });
  }

  async synthesizeStream(input: SynthesizeInput): Promise<Response> {
    const voice = input.voice ?? (this.config.defaultTtsVoice || undefined);

    return this.client.synthesizeStream({
      text: input.text,
      voice,
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
          sttModel: "",
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
