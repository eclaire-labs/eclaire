/**
 * @eclaire/audio - Audio provider abstraction for STT/TTS
 *
 * Provides a typed client for mlx-audio-compatible servers.
 *
 * ## Usage
 *
 * ```typescript
 * import { MlxAudioProvider } from "@eclaire/audio";
 *
 * const provider = new MlxAudioProvider({
 *   baseUrl: "http://127.0.0.1:9100",
 *   requestTimeoutMs: 30000,
 *   defaultSttModel: "mlx-community/parakeet-tdt-0.6b-v3",
 *   defaultTtsModel: "pocket_tts",
 *   defaultTtsVoice: "",
 * });
 *
 * const result = await provider.transcribe({ file: "/path/to/audio.wav" });
 * console.log(result.text);
 * ```
 */

export { MlxAudioProvider } from "./mlx-provider.js";
export { MlxAudioClient, readAudioFile } from "./mlx-client.js";
export type {
  AudioHealth,
  AudioProvider,
  AudioProviderConfig,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
} from "./types.js";
