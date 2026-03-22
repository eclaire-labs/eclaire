/**
 * Audio Provider Types
 *
 * Core types for STT/TTS integration. The AudioProvider interface abstracts
 * over different audio backends (mlx-audio, ElevenLabs, etc.).
 */

// ============================================================================
// Provider Identity & Capabilities
// ============================================================================

/** Unique identifier for an audio provider */
export type AudioProviderId =
  | "mlx-audio"
  | "elevenlabs"
  | "whisper-cpp"
  | "pocket-tts";

/** What a provider supports */
export interface AudioProviderCapabilities {
  stt: boolean;
  tts: boolean;
  streamingStt: boolean;
  streamingTts: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

/** Config for the mlx-audio provider (also used as legacy AudioProviderConfig) */
export interface AudioProviderConfig {
  /** Base URL of the audio server (e.g. "http://127.0.0.1:9100") */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeoutMs: number;
  /** Default STT model identifier */
  defaultSttModel: string;
  /** Default TTS model identifier */
  defaultTtsModel: string;
  /** Default TTS voice identifier */
  defaultTtsVoice: string;
}

/** Config for the whisper-cpp provider (STT only) */
export interface WhisperCppProviderConfig {
  /** Base URL of the whisper-cpp server (e.g. "http://127.0.0.1:8080") */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeoutMs: number;
  /** Default STT model identifier (informational — model is loaded at server startup) */
  defaultSttModel: string;
}

/** Config for the pocket-tts provider (TTS only) */
export interface PocketTtsProviderConfig {
  /** Base URL of the pocket-tts server (e.g. "http://127.0.0.1:8000") */
  baseUrl: string;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeoutMs: number;
  /** Default TTS model identifier (informational — single model) */
  defaultTtsModel: string;
  /** Default TTS voice (e.g. "alba") */
  defaultTtsVoice: string;
}

/** Config for the ElevenLabs provider */
export interface ElevenLabsProviderConfig {
  /** ElevenLabs API key */
  apiKey: string;
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeoutMs: number;
  /** Default STT model identifier (e.g. "scribe_v1") */
  defaultSttModel: string;
  /** Default TTS model identifier (e.g. "eleven_multilingual_v2") */
  defaultTtsModel: string;
  /** Default TTS voice identifier (ElevenLabs voice ID) */
  defaultTtsVoice: string;
}

// ============================================================================
// STT Types
// ============================================================================

export interface TranscribeInput {
  /** Audio data as a Buffer or a file path to read from */
  file: Buffer | string;
  /** Original filename (used for MIME type detection) */
  fileName?: string;
  /** Override the default STT model */
  model?: string;
  /** Language code (e.g. "en") */
  language?: string;
}

export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
}

// ============================================================================
// TTS Types
// ============================================================================

export interface SynthesizeInput {
  /** Text to synthesize */
  text: string;
  /** Override the default TTS model */
  model?: string;
  /** Voice identifier */
  voice?: string;
  /** Speech speed multiplier (default: 1.0) */
  speed?: number;
  /** Output audio format */
  format?: "mp3" | "wav";
  /** Model-specific instruction (e.g., emotion/style for Qwen3-TTS CustomVoice) */
  instruct?: string;
}

// ============================================================================
// Health Types
// ============================================================================

/** Health info for a single provider */
export interface AudioProviderHealth {
  providerId: AudioProviderId;
  status: "ready" | "unavailable";
  capabilities: AudioProviderCapabilities;
  defaults?: {
    sttModel: string;
    ttsModel: string;
    ttsVoice: string;
  };
}

/** Aggregate health across all providers (backwards compatible) */
export interface AudioHealth {
  status: "ready" | "unavailable";
  models?: Array<{ id: string }>;
  streamingEnabled?: boolean;
  defaults?: {
    sttModel: string;
    ttsModel: string;
    ttsVoice: string;
  };
  /** Per-provider health details */
  providers?: AudioProviderHealth[];
}

// ============================================================================
// Streaming STT Types
// ============================================================================

export interface StreamingTranscriptionEvent {
  type: "delta" | "complete";
  text: string;
}

/** Abstract interface for real-time streaming STT clients */
export interface RealtimeTranscriptionClient {
  connect(): Promise<void>;
  sendAudio(chunk: Buffer): void;
  sendJson(data: Record<string, unknown>): void;
  close(): void;
  readonly isConnected: boolean;
  onDelta(handler: (text: string) => void): void;
  onComplete(handler: (text: string) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface AudioProvider {
  /** Provider identifier */
  readonly providerId: AudioProviderId;
  /** What this provider supports */
  readonly capabilities: AudioProviderCapabilities;
  /** Transcribe audio to text */
  transcribe(input: TranscribeInput): Promise<TranscriptionResult>;
  /** Synthesize text to audio */
  synthesize(input: SynthesizeInput): Promise<Buffer>;
  /** Synthesize text to audio, returning the raw streaming response */
  synthesizeStream(input: SynthesizeInput): Promise<Response>;
  /** Check if the audio server is reachable and ready */
  checkHealth(): Promise<AudioProviderHealth>;
}
