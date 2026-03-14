/**
 * useAudioRecorder — Encapsulates the MediaRecorder browser API.
 *
 * Provides push-to-talk recording: start → stop → get Blob.
 * Handles permission prompts, codec fallbacks, and cleanup.
 */

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderStatus = "idle" | "recording" | "error";

interface UseAudioRecorderReturn {
  status: RecorderStatus;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
  isSupported: boolean;
  errorMessage: string | null;
}

const MAX_RECORDING_MS = 60_000; // 60 seconds
const MIN_RECORDING_MS = 500; // ignore stop if recording is shorter than this

function getPreferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return "audio/mp4";
  }
  return "";
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveStopRef = useRef<((blob: Blob | null) => void) | null>(null);
  const startTimeRef = useRef<number>(0);
  const isStartingRef = useRef(false);

  const isSupported =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined";

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!isSupported) return;
    if (isStartingRef.current || mediaRecorderRef.current) return;

    setErrorMessage(null);
    isStartingRef.current = true;

    // Fire-and-forget — no await so pointer events aren't blocked
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        streamRef.current = stream;

        const mimeType = getPreferredMimeType();
        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          chunksRef.current = [];

          // Release mic
          if (streamRef.current) {
            for (const track of streamRef.current.getTracks()) {
              track.stop();
            }
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;

          if (resolveStopRef.current) {
            resolveStopRef.current(blob);
            resolveStopRef.current = null;
          }
        };

        // Use timeslice to capture data in chunks (more robust)
        recorder.start(100);
        startTimeRef.current = Date.now();
        isStartingRef.current = false;
        // Only set status AFTER recording has actually started
        setStatus("recording");

        // Auto-stop at max duration
        timerRef.current = setTimeout(() => {
          if (
            mediaRecorderRef.current &&
            mediaRecorderRef.current.state === "recording"
          ) {
            mediaRecorderRef.current.stop();
            setStatus("idle");
          }
        }, MAX_RECORDING_MS);
      } catch (err) {
        isStartingRef.current = false;
        const msg =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Microphone permission denied"
            : "Failed to start recording";
        setErrorMessage(msg);
        setStatus("error");
      }
    })();
  }, [isSupported]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    async function waitForStart(): Promise<boolean> {
      for (let i = 0; i < 60; i++) {
        if (!isStartingRef.current) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      isStartingRef.current = false;
      return false;
    }

    function finalizeStop(): Promise<Blob | null> {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        setStatus("idle");
        return Promise.resolve(null);
      }

      // Enforce minimum recording duration — wait if needed
      const elapsed = Date.now() - startTimeRef.current;
      const waitMs =
        elapsed < MIN_RECORDING_MS ? MIN_RECORDING_MS - elapsed : 0;

      return new Promise((resolve) => {
        const doIt = () => {
          // Re-check state after wait
          if (
            !mediaRecorderRef.current ||
            mediaRecorderRef.current.state !== "recording"
          ) {
            setStatus("idle");
            resolve(null);
            return;
          }
          resolveStopRef.current = resolve;
          mediaRecorderRef.current.stop();
          setStatus("idle");
        };

        if (waitMs > 0) {
          setTimeout(doIt, waitMs);
        } else {
          doIt();
        }
      });
    }

    // If still starting, wait for it to be ready
    if (isStartingRef.current) {
      const ready = await waitForStart();
      if (!ready) return null;
    }

    return finalizeStop();
  }, []);

  return {
    status,
    startRecording,
    stopRecording,
    isSupported,
    errorMessage,
  };
}
