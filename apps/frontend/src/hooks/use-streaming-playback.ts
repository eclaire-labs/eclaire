/**
 * useStreamingPlayback — Play TTS audio as it streams from the backend.
 *
 * Uses Web Audio API to decode and schedule WAV PCM chunks for gapless
 * playback. Audio begins playing as soon as the first chunk arrives,
 * while synthesis continues in the background.
 */

import { useCallback, useRef, useState } from "react";
import { useAudio } from "@/hooks/use-audio";

type PlaybackStatus = "idle" | "loading" | "playing";

const WAV_HEADER_SIZE = 44;

interface WavHeader {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
}

function parseWavHeader(data: Uint8Array): WavHeader | null {
  if (data.length < WAV_HEADER_SIZE) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Check RIFF header
  const riff = String.fromCharCode(
    data[0] ?? 0,
    data[1] ?? 0,
    data[2] ?? 0,
    data[3] ?? 0,
  );
  if (riff !== "RIFF") return null;

  return {
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
}

interface UseStreamingPlaybackReturn {
  status: PlaybackStatus;
  play: (text: string) => Promise<void>;
  stop: () => void;
}

export function useStreamingPlayback(): UseStreamingPlaybackReturn {
  const { synthesizeStream } = useAudio();
  const [status, setStatus] = useState<PlaybackStatus>("idle");

  const audioContextRef = useRef<AudioContext | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayTimeRef = useRef(0);
  const stoppedRef = useRef(false);

  const cleanup = useCallback(() => {
    stoppedRef.current = true;
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    sourcesRef.current = [];
    if (readerRef.current) {
      readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    nextPlayTimeRef.current = 0;
  }, []);

  const play = useCallback(
    async (text: string) => {
      if (status !== "idle") return;

      stoppedRef.current = false;
      setStatus("loading");

      try {
        const reader = await synthesizeStream(text);
        readerRef.current = reader;

        if (stoppedRef.current) {
          reader.cancel();
          setStatus("idle");
          return;
        }

        let header: WavHeader | null = null;
        let leftover = new Uint8Array(0);
        let headerParsed = false;
        let audioCtx: AudioContext | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done || stoppedRef.current) break;

          // Accumulate data
          const combined = new Uint8Array(leftover.length + value.length);
          combined.set(leftover);
          combined.set(value, leftover.length);

          // Parse WAV header from first chunk
          if (!headerParsed) {
            header = parseWavHeader(combined);
            if (!header) {
              // Not enough data yet for header
              leftover = combined;
              continue;
            }
            headerParsed = true;
            audioCtx = new AudioContext({ sampleRate: header.sampleRate });
            audioContextRef.current = audioCtx;
            nextPlayTimeRef.current = audioCtx.currentTime + 0.05;

            // Strip header, keep PCM data
            leftover = combined.slice(WAV_HEADER_SIZE);
            setStatus("playing");
            continue;
          }

          leftover = combined;

          if (!audioCtx || !header) continue;

          // Process PCM data in chunks
          const bytesPerSample = header.bitsPerSample / 8;
          const blockAlign = header.numChannels * bytesPerSample;
          // Use available complete samples
          const usableBytes =
            Math.floor(leftover.length / blockAlign) * blockAlign;

          if (usableBytes === 0) continue;

          const pcmData = leftover.slice(0, usableBytes);
          leftover = leftover.slice(usableBytes);

          // Convert int16 PCM to float32 for Web Audio API
          const numSamples = pcmData.length / bytesPerSample;
          const samplesPerChannel = numSamples / header.numChannels;
          const audioBuffer = audioCtx.createBuffer(
            header.numChannels,
            samplesPerChannel,
            header.sampleRate,
          );

          const pcmView = new DataView(
            pcmData.buffer,
            pcmData.byteOffset,
            pcmData.byteLength,
          );

          for (let ch = 0; ch < header.numChannels; ch++) {
            const channelData = audioBuffer.getChannelData(ch);
            for (let i = 0; i < samplesPerChannel; i++) {
              const offset = (i * header.numChannels + ch) * bytesPerSample;
              if (offset + 1 < pcmData.byteLength) {
                const sample = pcmView.getInt16(offset, true);
                channelData[i] = sample / 32768;
              }
            }
          }

          // Schedule this buffer for gapless playback
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioCtx.destination);
          source.start(nextPlayTimeRef.current);
          sourcesRef.current.push(source);

          nextPlayTimeRef.current += audioBuffer.duration;
        }

        // Wait for all scheduled audio to finish playing
        if (audioCtx && !stoppedRef.current) {
          const remainingMs =
            (nextPlayTimeRef.current - audioCtx.currentTime) * 1000 + 100;
          if (remainingMs > 0) {
            const waitEnd = Date.now() + remainingMs;
            while (Date.now() < waitEnd && !stoppedRef.current) {
              await new Promise((r) => setTimeout(r, 100));
            }
          }
        }
      } catch (err) {
        console.error("[StreamingPlayback] Error:", err);
      } finally {
        cleanup();
        setStatus("idle");
      }
    },
    [status, synthesizeStream, cleanup],
  );

  const stop = useCallback(() => {
    cleanup();
    setStatus("idle");
  }, [cleanup]);

  return { status, play, stop };
}
