/**
 * useAudio — API communication hook for STT/TTS.
 *
 * Provides transcribe/synthesize functions and audio service availability check.
 * Uses the backend audio endpoints at /api/audio/*.
 * Reads model/voice/speed/provider preferences and passes them through API calls.
 */

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch, apiGet, apiPost } from "@/lib/api-client";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";

interface AudioHealthDefaults {
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
}

export interface AudioProviderHealth {
  providerId: string;
  status: "ready" | "unavailable";
  capabilities: {
    stt: boolean;
    tts: boolean;
    streamingStt: boolean;
    streamingTts: boolean;
  };
  defaults?: AudioHealthDefaults;
}

interface AudioHealth {
  status: "ready" | "unavailable";
  models?: Array<{ id: string }>;
  streamingEnabled?: boolean;
  defaults?: AudioHealthDefaults;
  providers?: AudioProviderHealth[];
}

interface UseAudioReturn {
  /** Send an audio blob for transcription, returns transcribed text. */
  transcribe: (blob: Blob) => Promise<string>;
  isTranscribing: boolean;

  /** Send text for synthesis, returns an object URL for playback. */
  synthesize: (text: string) => Promise<string>;
  isSynthesizing: boolean;

  /** Send text for streaming synthesis, returns a ReadableStream reader. */
  synthesizeStream: (
    text: string,
  ) => Promise<ReadableStreamDefaultReader<Uint8Array>>;

  /** Whether any audio provider is available and ready. */
  isAudioAvailable: boolean;
  isCheckingAvailability: boolean;

  /** Whether the selected STT provider supports streaming. */
  isStreamingSttEnabled: boolean;
  /** Whether the selected TTS provider supports streaming. */
  isStreamingTtsEnabled: boolean;
  /** @deprecated Use isStreamingSttEnabled. Kept for backwards compat. */
  isStreamingEnabled: boolean;

  /** Defaults for the selected STT provider. */
  sttDefaults: AudioHealthDefaults | null;
  /** Defaults for the selected TTS provider. */
  ttsDefaults: AudioHealthDefaults | null;
  /** @deprecated Use sttDefaults/ttsDefaults. */
  defaults: AudioHealthDefaults | null;

  /** Currently loaded models on the audio server. */
  models: Array<{ id: string }>;

  /** Available audio providers from the health check. */
  providers: AudioProviderHealth[];

  /** Re-run the health check to test connectivity. */
  checkConnection: () => Promise<void>;
}

/**
 * Convert any audio Blob to WAV using the browser's AudioContext.
 * This ensures compatibility with backends that don't support WebM/Opus.
 */
async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // Interleave channels into a single Int16 PCM buffer
    const pcmLength = length * numChannels;
    const pcm = new Int16Array(pcmLength);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        // Clamp float [-1, 1] to int16
        const s = Math.max(-1, Math.min(1, channelData[i] ?? 0));
        pcm[i * numChannels + ch] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    }

    // Build WAV file
    const wavBuffer = new ArrayBuffer(44 + pcm.byteLength);
    const view = new DataView(wavBuffer);
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, "data");
    view.setUint32(40, pcm.byteLength, true);

    new Uint8Array(wavBuffer, 44).set(new Uint8Array(pcm.buffer));

    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    await audioCtx.close();
  }
}

export function useAudio(): UseAudioReturn {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [preferences] = useAssistantPreferences();

  // Track object URLs for cleanup
  const objectUrlsRef = useRef<string[]>([]);

  // Revoke all object URLs on unmount
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  // Health check — polls every 60s, no retry on failure
  const {
    data: health,
    isLoading: isCheckingAvailability,
    refetch,
  } = useQuery<AudioHealth>({
    queryKey: ["audio", "health"],
    queryFn: async () => {
      try {
        const response = await apiGet("/api/audio/health");
        return await response.json();
      } catch {
        return { status: "unavailable" as const };
      }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const isAudioAvailable = health?.status === "ready";
  const providersList = health?.providers ?? [];

  // Resolve selected providers and their capabilities
  const sttProviderHealth = preferences.sttProvider
    ? providersList.find((p) => p.providerId === preferences.sttProvider)
    : providersList.find((p) => p.capabilities.stt);
  const ttsProviderHealth = preferences.ttsProvider
    ? providersList.find((p) => p.providerId === preferences.ttsProvider)
    : providersList.find((p) => p.capabilities.tts);

  const isStreamingSttEnabled =
    sttProviderHealth?.capabilities.streamingStt === true;
  const isStreamingTtsEnabled =
    ttsProviderHealth?.capabilities.streamingTts === true;
  // Legacy compat
  const isStreamingEnabled = isStreamingSttEnabled;

  const sttDefaults = sttProviderHealth?.defaults ?? null;
  const ttsDefaults = ttsProviderHealth?.defaults ?? null;
  const defaults = health?.defaults ?? sttDefaults;
  const models = health?.models ?? [];

  const checkConnection = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Build TTS body with user-selected model/voice/speed/provider overrides
  const buildTtsBody = useCallback(
    (text: string, extra?: Record<string, unknown>) => {
      const body: Record<string, unknown> = { text, ...extra };
      if (preferences.ttsModel) body.model = preferences.ttsModel;
      if (preferences.ttsVoice) body.voice = preferences.ttsVoice;
      if (preferences.ttsSpeed !== 1.0) body.speed = preferences.ttsSpeed;
      if (preferences.ttsProvider) body.provider = preferences.ttsProvider;
      return body;
    },
    [
      preferences.ttsModel,
      preferences.ttsVoice,
      preferences.ttsSpeed,
      preferences.ttsProvider,
    ],
  );

  const transcribe = useCallback(
    async (blob: Blob): Promise<string> => {
      setIsTranscribing(true);
      try {
        // Convert to WAV for maximum backend compatibility
        const wavBlob = await blobToWav(blob);
        const formData = new FormData();
        formData.append("file", wavBlob, "recording.wav");
        if (preferences.sttModel) {
          formData.append("model", preferences.sttModel);
        }
        if (preferences.sttProvider) {
          formData.append("provider", preferences.sttProvider);
        }

        const response = await apiPost("/api/audio/transcriptions", formData);
        const data = await response.json();
        return data.text ?? "";
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transcription failed";
        toast.error("Transcription failed", { description: msg });
        throw err;
      } finally {
        setIsTranscribing(false);
      }
    },
    [preferences.sttModel, preferences.sttProvider],
  );

  const synthesize = useCallback(
    async (text: string): Promise<string> => {
      setIsSynthesizing(true);
      try {
        const response = await apiFetch("/api/audio/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildTtsBody(text, { format: "mp3" })),
        });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        return url;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Speech synthesis failed";
        toast.error("Speech synthesis failed", { description: msg });
        throw err;
      } finally {
        setIsSynthesizing(false);
      }
    },
    [buildTtsBody],
  );

  const synthesizeStream = useCallback(
    async (text: string): Promise<ReadableStreamDefaultReader<Uint8Array>> => {
      try {
        const response = await apiFetch("/api/audio/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildTtsBody(text, { format: "wav", stream: true }),
          ),
        });
        if (!response.body) {
          throw new Error("No response body for streaming synthesis");
        }
        return response.body.getReader();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Streaming synthesis failed";
        toast.error("Speech synthesis failed", { description: msg });
        throw err;
      }
    },
    [buildTtsBody],
  );

  return {
    transcribe,
    isTranscribing,
    synthesize,
    isSynthesizing,
    synthesizeStream,
    isAudioAvailable,
    isCheckingAvailability,
    isStreamingSttEnabled,
    isStreamingTtsEnabled,
    isStreamingEnabled,
    sttDefaults,
    ttsDefaults,
    defaults,
    models,
    providers: providersList,
    checkConnection,
  };
}
