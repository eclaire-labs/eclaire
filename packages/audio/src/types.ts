/**
 * Audio Provider Types
 *
 * Core types for STT/TTS integration. The AudioProvider interface abstracts
 * over different audio backends (mlx-audio, etc.).
 */

// ============================================================================
// Configuration
// ============================================================================

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
}

// ============================================================================
// Health Types
// ============================================================================

export interface AudioHealth {
  status: "ready" | "unavailable";
  models?: Array<{ id: string }>;
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface AudioProvider {
  /** Transcribe audio to text */
  transcribe(input: TranscribeInput): Promise<TranscriptionResult>;
  /** Synthesize text to audio */
  synthesize(input: SynthesizeInput): Promise<Buffer>;
  /** Check if the audio server is reachable and ready */
  checkHealth(): Promise<AudioHealth>;
}
