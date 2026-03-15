/**
 * Audio Service
 *
 * Thin service layer over @eclaire/audio. Creates and holds the audio provider
 * singleton. Other modules call these functions to transcribe/synthesize.
 */

import {
  MlxAudioProvider,
  type AudioHealth,
  type AudioProvider,
  type AudioProviderConfig,
  type SynthesizeInput,
  type TranscribeInput,
  type TranscriptionResult,
} from "@eclaire/audio";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("services:audio");

let provider: AudioProvider | null = null;
let audioConfig: AudioProviderConfig | null = null;

/**
 * Initialize the audio service with the given config.
 * Creates the provider but does not verify connectivity.
 */
export function initAudioService(cfg: AudioProviderConfig): void {
  audioConfig = cfg;
  provider = new MlxAudioProvider(cfg);
  logger.info({ baseUrl: cfg.baseUrl }, "Audio provider created");
}

/**
 * Whether the audio service has been initialized.
 */
export function isAudioAvailable(): boolean {
  return provider !== null;
}

/**
 * Transcribe audio to text.
 */
export async function transcribe(
  input: TranscribeInput,
): Promise<TranscriptionResult> {
  if (!provider) {
    throw new Error("Audio service is not enabled");
  }
  return provider.transcribe(input);
}

/**
 * Synthesize text to audio.
 */
export async function synthesize(input: SynthesizeInput): Promise<Buffer> {
  if (!provider) {
    throw new Error("Audio service is not enabled");
  }
  return provider.synthesize(input);
}

/**
 * Synthesize text to audio, returning a streaming response.
 */
export async function synthesizeStream(
  input: SynthesizeInput,
): Promise<Response> {
  if (!provider) {
    throw new Error("Audio service is not enabled");
  }
  return provider.synthesizeStream(input);
}

/**
 * Check audio server health.
 */
export async function getAudioHealth(): Promise<AudioHealth> {
  if (!provider) {
    return { status: "unavailable" };
  }
  const health = await provider.checkHealth();
  if (health.status === "ready") {
    health.streamingEnabled = true;
    if (audioConfig) {
      health.defaults = {
        sttModel: audioConfig.defaultSttModel,
        ttsModel: audioConfig.defaultTtsModel,
        ttsVoice: audioConfig.defaultTtsVoice,
      };
    }
  }
  return health;
}

/**
 * Get the audio provider config (for WebSocket proxy).
 */
export function getAudioConfig(): AudioProviderConfig | null {
  return audioConfig;
}

/**
 * Create a `processAudioMessage` function for channel adapters.
 *
 * Composes: STT (transcribe) → AI prompt → optional TTS (synthesize).
 * The returned function checks audio availability at call time, so it's safe
 * to create before the audio provider is initialized.
 */
export function createProcessAudioMessage(deps: {
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  processPromptRequest: (...args: any[]) => Promise<{ response?: string }>;
  // biome-ignore lint/suspicious/noExplicitAny: signature varies by backend version
  recordHistory: (entry: any) => Promise<void>;
}): (
  userId: string,
  audioBuffer: Buffer,
  metadata: Record<string, unknown>,
) => Promise<{ response?: string; audioResponse?: Buffer }> {
  return async (userId, audioBuffer, metadata) => {
    if (!isAudioAvailable()) {
      throw new Error("Audio service not available");
    }

    // 1. Transcribe audio to text
    const { text } = await transcribe({
      file: audioBuffer,
      fileName: `voice.${(metadata.format as string) ?? "ogg"}`,
    });

    if (!text?.trim()) {
      return { response: undefined };
    }

    // 2. Process transcribed text through AI agent
    const agentActorId = (metadata.agentActorId as string) ?? "eclaire";
    const result = await deps.processPromptRequest({
      userId,
      prompt: text,
      context: { agentActorId },
      requestId: `audio-${metadata.channelId}-${Date.now()}`,
      conversationId: metadata.sessionId,
    });

    // 3. Optional TTS synthesis
    let audioResponse: Buffer | undefined;
    if (metadata.ttsEnabled && result.response) {
      audioResponse = await synthesize({
        text: result.response,
        format: ((metadata.ttsFormat as string) ?? "mp3") as "mp3" | "wav",
      });
    }

    return { response: result.response, audioResponse };
  };
}
