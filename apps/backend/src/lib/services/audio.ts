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
  }
  return health;
}

/**
 * Get the audio provider config (for WebSocket proxy).
 */
export function getAudioConfig(): AudioProviderConfig | null {
  return audioConfig;
}
