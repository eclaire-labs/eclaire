/**
 * @eclaire/audio - Audio provider abstraction for STT/TTS
 *
 * Provides typed clients for multiple audio backends (mlx-audio, ElevenLabs).
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
export { MlxRealtimeClient } from "./mlx-ws-client.js";
export { ElevenLabsProvider } from "./elevenlabs-provider.js";
export { ElevenLabsClient } from "./elevenlabs-client.js";
export { WhisperCppProvider } from "./whisper-cpp-provider.js";
export { WhisperCppClient } from "./whisper-cpp-client.js";
export { PocketTtsProvider } from "./pocket-tts-provider.js";
export { PocketTtsClient } from "./pocket-tts-client.js";
export type {
  AudioHealth,
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderConfig,
  AudioProviderHealth,
  AudioProviderId,
  ElevenLabsProviderConfig,
  WhisperCppProviderConfig,
  PocketTtsProviderConfig,
  RealtimeTranscriptionClient,
  StreamingTranscriptionEvent,
  SynthesizeInput,
  TranscribeInput,
  TranscriptionResult,
} from "./types.js";
export type { MlxRealtimeConfig } from "./mlx-ws-client.js";
