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

/**
 * Initialize the audio service with the given config.
 * Creates the provider but does not verify connectivity.
 */
export function initAudioService(audioConfig: AudioProviderConfig): void {
  provider = new MlxAudioProvider(audioConfig);
  logger.info({ baseUrl: audioConfig.baseUrl }, "Audio provider created");
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
 * Check audio server health.
 */
export async function getAudioHealth(): Promise<AudioHealth> {
  if (!provider) {
    return { status: "unavailable" };
  }
  return provider.checkHealth();
}
