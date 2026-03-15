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
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudio } from "@/hooks/use-audio";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useStreamingTranscription } from "@/hooks/use-streaming-transcription";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";

interface PushToTalkButtonProps {
  onTranscription: (text: string) => void;
  onPartialTranscription?: (text: string | null) => void;
  disabled?: boolean;
}

export function PushToTalkButton({
  onTranscription,
  onPartialTranscription,
  disabled = false,
}: PushToTalkButtonProps) {
  const { transcribe, isTranscribing, isAudioAvailable, isStreamingEnabled } =
    useAudio();
  const {
    status: recorderStatus,
    startRecording,
    stopRecording,
    isSupported,
  } = useAudioRecorder();
  const streaming = useStreamingTranscription();
  const [preferences] = useAssistantPreferences();
  const isActiveRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const useStreaming = isStreamingEnabled && preferences.useStreamingSTT;

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
        console.error("[PTT] Streaming transcription error:", err);
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
  ]);

  // --- Non-streaming fallback handlers ---
  const handleRecordStart = useCallback(() => {
    if (disabled || isTranscribing || isProcessing || isActiveRef.current)
      return;
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
        console.error("[PTT] Transcription error:", err);
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
  ]);

  // Don't render when audio is unavailable or browser doesn't support recording
  if (!isAudioAvailable || !isSupported) {
    return null;
  }

  const isStreaming =
    streaming.status === "streaming" || streaming.status === "connecting";
  const isRecording = recorderStatus === "recording";
  const isActive = useStreaming ? isStreaming : isRecording;
  const isBusy = isTranscribing || isProcessing;

  return (
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
  );
}
