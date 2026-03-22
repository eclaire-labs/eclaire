/**
 * Whisper.cpp Audio Provider
 *
 * Implements AudioProvider using a local whisper-cpp server.
 * Supports STT only (no TTS, no streaming STT).
 */

import { readAudioFile } from "./mlx-client.js";
import { WhisperCppClient } from "./whisper-cpp-client.js";
import type {
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderHealth,
  AudioProviderId,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
  WhisperCppProviderConfig,
} from "./types.js";

export class WhisperCppProvider implements AudioProvider {
  readonly providerId: AudioProviderId = "whisper-cpp";
  readonly capabilities: AudioProviderCapabilities = {
    stt: true,
    tts: false,
    streamingStt: false,
    streamingTts: false,
  };

  private readonly client: WhisperCppClient;
  private readonly config: WhisperCppProviderConfig;

  constructor(config: WhisperCppProviderConfig) {
    this.config = config;
    this.client = new WhisperCppClient({
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

    return this.client.transcribe({
      file,
      fileName,
      language: input.language,
    });
  }

  async synthesize(_input: SynthesizeInput): Promise<Buffer> {
    throw new Error("whisper-cpp does not support text-to-speech");
  }

  async synthesizeStream(_input: SynthesizeInput): Promise<Response> {
    throw new Error("whisper-cpp does not support text-to-speech");
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
          ttsModel: "",
          ttsVoice: "",
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
