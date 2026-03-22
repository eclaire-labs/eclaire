/**
 * Audio Service
 *
 * Manages a registry of audio providers (mlx-audio, ElevenLabs, etc.).
 * Routes STT/TTS requests to the appropriate provider based on the caller's
 * selection, falling back to "mlx-audio" if none is specified.
 */

import {
  MlxAudioProvider,
  MlxRealtimeClient,
  ElevenLabsProvider,
  WhisperCppProvider,
  PocketTtsProvider,
  type AudioHealth,
  type AudioProvider,
  type AudioProviderConfig,
  type AudioProviderId,
  type AudioProviderHealth,
  type ElevenLabsProviderConfig,
  type WhisperCppProviderConfig,
  type PocketTtsProviderConfig,
  type RealtimeTranscriptionClient,
  type SynthesizeInput,
  type TranscribeInput,
  type TranscriptionResult,
} from "@eclaire/audio";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("services:audio");

const providers = new Map<AudioProviderId, AudioProvider>();
const configs = new Map<AudioProviderId, unknown>();

const DEFAULT_PROVIDER: AudioProviderId = "mlx-audio";

// ============================================================================
// Initialization
// ============================================================================

export interface AudioServiceConfig {
  mlxAudio?: AudioProviderConfig;
  elevenLabs?: ElevenLabsProviderConfig;
  whisperCpp?: WhisperCppProviderConfig;
  pocketTts?: PocketTtsProviderConfig;
}

/**
 * Initialize all configured audio providers.
 */
export function initAudioProviders(cfg: AudioServiceConfig): void {
  if (cfg.mlxAudio) {
    providers.set("mlx-audio", new MlxAudioProvider(cfg.mlxAudio));
    configs.set("mlx-audio", cfg.mlxAudio);
    logger.info(
      { baseUrl: cfg.mlxAudio.baseUrl },
      "mlx-audio provider created",
    );
  }
  if (cfg.elevenLabs) {
    providers.set("elevenlabs", new ElevenLabsProvider(cfg.elevenLabs));
    configs.set("elevenlabs", cfg.elevenLabs);
    logger.info("ElevenLabs provider created");
  }
  if (cfg.whisperCpp) {
    providers.set("whisper-cpp", new WhisperCppProvider(cfg.whisperCpp));
    configs.set("whisper-cpp", cfg.whisperCpp);
    logger.info(
      { baseUrl: cfg.whisperCpp.baseUrl },
      "whisper-cpp provider created",
    );
  }
  if (cfg.pocketTts) {
    providers.set("pocket-tts", new PocketTtsProvider(cfg.pocketTts));
    configs.set("pocket-tts", cfg.pocketTts);
    logger.info(
      { baseUrl: cfg.pocketTts.baseUrl },
      "pocket-tts provider created",
    );
  }
}

/**
 * @deprecated Use initAudioProviders instead. Kept for backwards compatibility.
 */
export function initAudioService(cfg: AudioProviderConfig): void {
  initAudioProviders({ mlxAudio: cfg });
}

// ============================================================================
// Provider Resolution
// ============================================================================

function resolveProvider(requestedId?: string): AudioProvider {
  const id = (requestedId as AudioProviderId) || DEFAULT_PROVIDER;
  const p = providers.get(id);
  if (!p) {
    throw new Error(`Audio provider "${id}" is not configured`);
  }
  return p;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Whether any audio provider has been initialized.
 */
export function isAudioAvailable(): boolean {
  return providers.size > 0;
}

/**
 * Get the list of configured provider IDs.
 */
export function getAvailableProviders(): AudioProviderId[] {
  return [...providers.keys()];
}

/**
 * Transcribe audio to text.
 */
export async function transcribe(
  input: TranscribeInput,
  sttProvider?: string,
): Promise<TranscriptionResult> {
  const provider = resolveProvider(sttProvider);
  if (!provider.capabilities.stt) {
    throw new Error(`Provider "${provider.providerId}" does not support STT`);
  }
  return provider.transcribe(input);
}

/**
 * Synthesize text to audio.
 */
export async function synthesize(
  input: SynthesizeInput,
  ttsProvider?: string,
): Promise<Buffer> {
  const provider = resolveProvider(ttsProvider);
  if (!provider.capabilities.tts) {
    throw new Error(`Provider "${provider.providerId}" does not support TTS`);
  }
  return provider.synthesize(input);
}

/**
 * Synthesize text to audio, returning a streaming response.
 */
export async function synthesizeStream(
  input: SynthesizeInput,
  ttsProvider?: string,
): Promise<Response> {
  const provider = resolveProvider(ttsProvider);
  if (!provider.capabilities.tts) {
    throw new Error(`Provider "${provider.providerId}" does not support TTS`);
  }
  return provider.synthesizeStream(input);
}

/**
 * Aggregate health across all configured providers.
 * Top-level fields are from the default provider for backwards compatibility.
 */
export async function getAudioHealth(): Promise<AudioHealth> {
  if (providers.size === 0) {
    return { status: "unavailable" };
  }

  const healthResults: AudioProviderHealth[] = await Promise.all(
    [...providers.values()].map((p) => p.checkHealth()),
  );

  // Top-level status: "ready" if any provider is ready
  const anyReady = healthResults.some((h) => h.status === "ready");

  // Top-level defaults come from the default provider (mlx-audio) for backwards compat
  const defaultHealth = healthResults.find(
    (h) => h.providerId === DEFAULT_PROVIDER,
  );

  return {
    status: anyReady ? "ready" : "unavailable",
    streamingEnabled: defaultHealth?.capabilities.streamingStt === true,
    defaults: defaultHealth?.defaults,
    providers: healthResults,
  };
}

/**
 * Get the raw config for a provider (used for WebSocket proxy).
 */
export function getProviderConfig(id: AudioProviderId): unknown | null {
  return configs.get(id) ?? null;
}

/**
 * @deprecated Use getProviderConfig("mlx-audio") instead.
 */
export function getAudioConfig(): AudioProviderConfig | null {
  return (configs.get("mlx-audio") as AudioProviderConfig) ?? null;
}

/**
 * Create a realtime streaming STT client for the given provider.
 * Returns null if the provider doesn't support streaming STT.
 */
export function createRealtimeClient(
  sttProvider?: string,
  model?: string,
  language?: string,
): RealtimeTranscriptionClient | null {
  const id = (sttProvider as AudioProviderId) || DEFAULT_PROVIDER;
  const provider = providers.get(id);

  if (!provider?.capabilities.streamingStt) {
    return null;
  }

  if (id === "mlx-audio") {
    const cfg = configs.get("mlx-audio") as AudioProviderConfig;
    if (!cfg) return null;
    return new MlxRealtimeClient({
      baseUrl: cfg.baseUrl,
      model: model || cfg.defaultSttModel,
      language,
    });
  }

  // Other providers: not yet supported
  return null;
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
