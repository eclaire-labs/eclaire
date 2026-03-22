/**
 * PushToTalkButton — Hold to record audio, release to transcribe.
 *
 * Self-contained: checks audio availability internally,
 * renders nothing when unavailable.
 *
 * Supports two modes:
 * - Streaming (Phase 2): real-time WebSocket STT with partial transcription
 * - Non-streaming (Phase 1 fallback): record → upload → transcribe
 */

import { Loader2, Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudio } from "@/hooks/use-audio";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useStreamingTranscription } from "@/hooks/use-streaming-transcription";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";

interface PushToTalkButtonProps {
  onTranscription: (text: string) => void;
  onPartialTranscription?: (text: string | null) => void;
  disabled?: boolean;
  onStopAutoPlay?: () => void;
}

export function PushToTalkButton({
  onTranscription,
  onPartialTranscription,
  disabled = false,
  onStopAutoPlay,
}: PushToTalkButtonProps) {
  const {
    transcribe,
    isTranscribing,
    isAudioAvailable,
    isStreamingSttEnabled,
  } = useAudio();
  const {
    status: recorderStatus,
    startRecording,
    stopRecording,
    isSupported,
    stream: recorderStream,
  } = useAudioRecorder();
  const [preferences] = useAssistantPreferences();
  const streaming = useStreamingTranscription({
    sttProvider: preferences.sttProvider || undefined,
  });
  const audioLevel = useAudioLevel();
  const isActiveRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const useStreaming = isStreamingSttEnabled && preferences.useStreamingSTT;

  // Start/stop audio level monitoring when recording state changes
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;

  useEffect(() => {
    const stream = useStreaming ? streaming.stream : recorderStream;
    const active = useStreaming
      ? streaming.status === "streaming"
      : recorderStatus === "recording";

    if (active && stream) {
      audioLevelRef.current.startMonitoring(stream);
    } else {
      audioLevelRef.current.stopMonitoring();
    }
  }, [
    useStreaming,
    streaming.status,
    streaming.stream,
    recorderStatus,
    recorderStream,
  ]);

  // Forward partial transcription text
  useEffect(() => {
    if (useStreaming && streaming.status === "streaming") {
      onPartialTranscription?.(streaming.partialText || null);
    }
  }, [
    useStreaming,
    streaming.status,
    streaming.partialText,
    onPartialTranscription,
  ]);

  // --- Streaming mode handlers ---
  const handleStreamingStart = useCallback(() => {
    if (disabled || isProcessing || isActiveRef.current) return;
    onStopAutoPlay?.(); // Barge-in: stop any auto-playing TTS
    isActiveRef.current = true;
    streaming.start();

    const handleGlobalUp = async () => {
      window.removeEventListener("mouseup", handleGlobalUp);
      if (!isActiveRef.current) return;
      isActiveRef.current = false;

      setIsProcessing(true);
      try {
        const text = await streaming.stop();
        onPartialTranscription?.(null);
        if (text?.trim()) {
          onTranscription(text.trim());
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transcription failed";
        toast.error("Transcription failed", { description: msg });
      } finally {
        setIsProcessing(false);
      }
    };

    window.addEventListener("mouseup", handleGlobalUp, { once: true });
  }, [
    disabled,
    isProcessing,
    streaming,
    onTranscription,
    onPartialTranscription,
    onStopAutoPlay,
  ]);

  // --- Non-streaming fallback handlers ---
  const handleRecordStart = useCallback(() => {
    if (disabled || isTranscribing || isProcessing || isActiveRef.current)
      return;
    onStopAutoPlay?.(); // Barge-in: stop any auto-playing TTS
    isActiveRef.current = true;
    startRecording();

    const handleGlobalUp = async () => {
      window.removeEventListener("mouseup", handleGlobalUp);
      if (!isActiveRef.current) return;
      isActiveRef.current = false;

      setIsProcessing(true);
      try {
        const blob = await stopRecording();
        if (!blob || blob.size === 0) {
          setIsProcessing(false);
          return;
        }

        const text = await transcribe(blob);
        if (text.trim()) {
          onTranscription(text.trim());
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Transcription failed";
        toast.error("Transcription failed", { description: msg });
      } finally {
        setIsProcessing(false);
      }
    };

    window.addEventListener("mouseup", handleGlobalUp, { once: true });
  }, [
    disabled,
    isTranscribing,
    isProcessing,
    startRecording,
    stopRecording,
    transcribe,
    onTranscription,
    onStopAutoPlay,
  ]);

  // Don't render when audio is unavailable or browser doesn't support recording
  if (!isAudioAvailable || !isSupported) {
    return null;
  }

  const isStreamingActive =
    streaming.status === "streaming" || streaming.status === "connecting";
  const isRecording = recorderStatus === "recording";
  const isActive = useStreaming ? isStreamingActive : isRecording;
  const isBusy = isTranscribing || isProcessing;

  return (
    <div className="flex items-center gap-1">
      {/* Audio level indicator — visible only during recording */}
      {isActive && (
        <div className="flex items-end gap-0.5 h-5">
          {[0.15, 0.3, 0.5, 0.75].map((threshold, i) => (
            <div
              key={threshold}
              className="w-0.5 rounded-full transition-all duration-75"
              style={{
                height:
                  audioLevel.level > threshold ? `${12 + i * 2}px` : "4px",
                backgroundColor:
                  audioLevel.level > threshold
                    ? "hsl(var(--destructive))"
                    : "hsl(var(--muted-foreground) / 0.3)",
              }}
            />
          ))}
        </div>
      )}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant={isActive ? "destructive" : "ghost"}
              disabled={disabled || isBusy}
              className={`flex-shrink-0 h-10 w-10 rounded-full ${isActive ? "animate-pulse" : ""}`}
              onMouseDown={
                useStreaming ? handleStreamingStart : handleRecordStart
              }
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : streaming.status === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isActive ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isBusy
              ? "Transcribing..."
              : streaming.status === "connecting"
                ? "Connecting..."
                : "Hold to record"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
