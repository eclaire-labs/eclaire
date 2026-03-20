/**
 * useStreamingTranscription — Real-time streaming STT via WebSocket.
 *
 * Opens a WebSocket to the backend, streams PCM audio from the mic
 * via AudioWorklet, and receives partial/final transcription events.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type StreamingStatus = "idle" | "connecting" | "streaming" | "error";

const MAX_STREAMING_MS = 60_000; // 60 seconds max

interface UseStreamingTranscriptionReturn {
  status: StreamingStatus;
  partialText: string;
  finalText: string | null;
  errorMessage: string | null;
  stream: MediaStream | null;
  start: () => void;
  stop: () => Promise<string | null>;
  cancel: () => void;
}

export function useStreamingTranscription(): UseStreamingTranscriptionReturn {
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [partialText, setPartialText] = useState("");
  const [finalText, setFinalText] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveStopRef = useRef<((text: string | null) => void) | null>(null);
  const statusRef = useRef<StreamingStatus>("idle");
  // Running transcript accumulated across all completed chunks in this session
  const sessionTextRef = useRef("");
  // Delta text within the current processing chunk (reset on each complete)
  const chunkDeltaRef = useRef("");

  // Keep ref in sync for use in callbacks
  statusRef.current = status;

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(() => {
    if (statusRef.current !== "idle") return;

    setErrorMessage(null);
    setPartialText("");
    setFinalText(null);
    sessionTextRef.current = "";
    chunkDeltaRef.current = "";
    setStatus("connecting");

    (async () => {
      try {
        // Build WebSocket URL
        const wsUrl = new URL(
          "/api/audio/transcriptions/stream",
          window.location.href,
        );
        wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

        const ws = new WebSocket(wsUrl.toString());
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        // Wait for WebSocket connection
        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error("WebSocket connection failed"));
          // Timeout after 10 seconds
          setTimeout(() => reject(new Error("Connection timeout")), 10_000);
        });

        // Wait for "connected" confirmation from backend
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Backend connection timeout")),
            10_000,
          );

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data as string);
              if (msg.type === "connected") {
                clearTimeout(timeout);
                resolve();
              } else if (msg.type === "error") {
                clearTimeout(timeout);
                reject(new Error(msg.error || "Connection error"));
              }
            } catch {
              // Ignore non-JSON messages during handshake
            }
          };
        });

        // Request microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;

        // Create AudioContext at 16kHz for mlx-audio compatibility
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        // Load AudioWorklet processor
        await audioContext.audioWorklet.addModule("/audio-pcm-worklet.js");

        // Wire up audio pipeline: mic → worklet → (silent) destination
        const source = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, "pcm-processor");
        workletNodeRef.current = workletNode;

        // Send PCM chunks from worklet to WebSocket
        workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };

        // Connect source → worklet. Use a silent gain node to keep the
        // audio graph active without playing back through speakers.
        const silentGain = audioContext.createGain();
        silentGain.gain.value = 0;
        source.connect(workletNode);
        workletNode.connect(silentGain);
        silentGain.connect(audioContext.destination);

        // Set up message handler for transcription events
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.type === "delta" && msg.delta !== undefined) {
              // Accumulate delta within the current chunk
              chunkDeltaRef.current += msg.delta;
              // Show full session text so far + current chunk partial
              const display = sessionTextRef.current
                ? `${sessionTextRef.current} ${chunkDeltaRef.current}`
                : chunkDeltaRef.current;
              setPartialText(display);
            } else if (msg.type === "complete" && msg.text !== undefined) {
              // Append completed chunk to session transcript
              sessionTextRef.current = sessionTextRef.current
                ? `${sessionTextRef.current} ${msg.text}`
                : msg.text;
              chunkDeltaRef.current = "";
              setPartialText(sessionTextRef.current);
              // Resolve stop() if it's waiting
              if (resolveStopRef.current) {
                resolveStopRef.current(sessionTextRef.current);
                resolveStopRef.current = null;
              }
            } else if (msg.type === "error") {
              const errorMsg = msg.error || "Transcription error";
              setErrorMessage(errorMsg);
              toast.error("Transcription error", { description: errorMsg });
              setStatus("error");
            }
          } catch {
            // Ignore non-JSON messages
          }
        };

        ws.onclose = () => {
          // Guard against stale close events from a previous connection
          if (wsRef.current !== ws) return;
          if (statusRef.current === "streaming") {
            if (resolveStopRef.current) {
              resolveStopRef.current(sessionTextRef.current || null);
              resolveStopRef.current = null;
            }
          }
          cleanup();
          setStatus("idle");
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          setErrorMessage("WebSocket error");
          toast.error("Audio streaming error", {
            description: "WebSocket connection lost",
          });
          cleanup();
          setStatus("error");
        };

        // Auto-stop at max duration
        timerRef.current = setTimeout(() => {
          if (statusRef.current === "streaming") {
            cleanup();
            setStatus("idle");
          }
        }, MAX_STREAMING_MS);

        setStatus("streaming");
      } catch (err) {
        cleanup();
        const isMicDenied =
          err instanceof DOMException && err.name === "NotAllowedError";
        const msg = isMicDenied
          ? "Microphone permission denied"
          : err instanceof Error
            ? err.message
            : "Failed to start streaming";
        setErrorMessage(msg);
        toast.error(
          isMicDenied ? "Microphone access denied" : "Streaming failed",
          { description: isMicDenied ? "Check browser permissions" : msg },
        );
        setStatus("error");
      }
    })();
  }, [cleanup]);

  const stop = useCallback(async (): Promise<string | null> => {
    if (statusRef.current !== "streaming") {
      return null;
    }

    // Flush any remaining buffered audio in the worklet, then disconnect
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage("flush");
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Signal the server to process remaining audio and send final result
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: "stop" }));
    }

    // Wait for the final "complete" event (with timeout).
    // If we already have session text and no more audio to process,
    // give the server a short window to send a final chunk.
    const result = await new Promise<string | null>((resolve) => {
      resolveStopRef.current = resolve;

      // Short timeout: the stop signal triggers final processing which
      // should be fast since the model is already loaded.
      setTimeout(() => {
        if (resolveStopRef.current) {
          resolveStopRef.current = null;
          // Return whatever we've accumulated so far
          resolve(sessionTextRef.current || null);
        }
      }, 5_000);
    });

    // Close WebSocket after receiving result
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setFinalText(result);
    setPartialText("");
    setStatus("idle");
    return result;
  }, []);

  const cancel = useCallback(() => {
    if (resolveStopRef.current) {
      resolveStopRef.current(null);
      resolveStopRef.current = null;
    }
    cleanup();
    setPartialText("");
    setFinalText(null);
    sessionTextRef.current = "";
    chunkDeltaRef.current = "";
    setStatus("idle");
  }, [cleanup]);

  return {
    status,
    partialText,
    finalText,
    errorMessage,
    stream: streamRef.current,
    start,
    stop,
    cancel,
  };
}
