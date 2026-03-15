/**
 * useAudioLevel — Monitor microphone input level via AnalyserNode.
 *
 * Returns a normalized level (0-1) updated ~15fps while monitoring.
 * Used to display a visual recording indicator during PTT.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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
  const dataRef = useRef<Uint8Array | null>(null);

  const poll = useCallback(() => {
    if (!analyserRef.current || !dataRef.current) return;

    analyserRef.current.getByteTimeDomainData(
      dataRef.current as Uint8Array<ArrayBuffer>,
    );

    // Compute RMS from time-domain data (values centered at 128)
    let sumSq = 0;
    for (let i = 0; i < dataRef.current.length; i++) {
      const v = ((dataRef.current[i] ?? 128) - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / dataRef.current.length);

    // Normalize: multiply by ~3 to make normal speech fill the meter
    setLevel(Math.min(1, rms * 3));

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

      dataRef.current = new Uint8Array(analyser.fftSize);
      rafRef.current = requestAnimationFrame(poll);
    },
    [stopMonitoring, poll],
  );

  // Cleanup on unmount
  useEffect(() => stopMonitoring, [stopMonitoring]);

  return { level, startMonitoring, stopMonitoring };
}
