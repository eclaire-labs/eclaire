/**
 * useAudioLevel — Monitor microphone input level via AnalyserNode.
 *
 * Returns a normalized level (0-1) updated ~15fps while monitoring.
 * Uses a dB scale for perceptually linear response and EMA smoothing
 * to avoid jitter.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** dB range mapped to [0, 1]. -60 dB ≈ silence, 0 dB = full scale. */
const MIN_DB = -60;
const DB_RANGE = 60; // 0 - (-60)

/** EMA smoothing factor (0–1). Higher = more responsive, lower = smoother. */
const SMOOTHING_ALPHA = 0.3;

/** Only push React state every N rAF frames (~60 fps / 4 ≈ 15 fps). */
const UPDATE_EVERY_N_FRAMES = 4;

interface UseAudioLevelReturn {
  level: number;
  startMonitoring: (stream: MediaStream) => void;
  stopMonitoring: () => void;
}

export function useAudioLevel(): UseAudioLevelReturn {
  const [level, setLevel] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Float32Array | null>(null);
  const smoothedRef = useRef(0);
  const frameRef = useRef(0);

  const poll = useCallback(() => {
    if (!analyserRef.current || !dataRef.current) return;

    analyserRef.current.getFloatTimeDomainData(
      dataRef.current as Float32Array<ArrayBuffer>,
    );

    // Compute RMS from float time-domain data (values in [-1, 1])
    let sumSq = 0;
    for (let i = 0; i < dataRef.current.length; i++) {
      const v = dataRef.current[i] ?? 0;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / dataRef.current.length);

    // Convert to dB and map [-60 dB, 0 dB] → [0, 1]
    const db = rms > 0 ? 20 * Math.log10(rms) : MIN_DB;
    const raw = Math.max(0, Math.min(1, (db - MIN_DB) / DB_RANGE));

    // Exponential moving average for smooth visual response
    smoothedRef.current =
      SMOOTHING_ALPHA * raw + (1 - SMOOTHING_ALPHA) * smoothedRef.current;

    // Throttle React state updates to ~15 fps
    frameRef.current++;
    if (frameRef.current >= UPDATE_EVERY_N_FRAMES) {
      frameRef.current = 0;
      setLevel(smoothedRef.current);
    }

    rafRef.current = requestAnimationFrame(poll);
  }, []);

  const stopMonitoring = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    dataRef.current = null;
    smoothedRef.current = 0;
    frameRef.current = 0;
    setLevel(0);
  }, []);

  const startMonitoring = useCallback(
    (stream: MediaStream) => {
      stopMonitoring();

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      source.connect(analyser);

      dataRef.current = new Float32Array(analyser.fftSize);
      rafRef.current = requestAnimationFrame(poll);
    },
    [stopMonitoring, poll],
  );

  // Cleanup on unmount
  useEffect(() => stopMonitoring, [stopMonitoring]);

  return { level, startMonitoring, stopMonitoring };
}
