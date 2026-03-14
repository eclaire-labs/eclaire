/**
 * PushToTalkButton — Hold to record audio, release to transcribe.
 *
 * Self-contained: checks audio availability internally,
 * renders nothing when unavailable.
 */

import { Loader2, Mic, MicOff } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudio } from "@/hooks/use-audio";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";

interface PushToTalkButtonProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

export function PushToTalkButton({
  onTranscription,
  disabled = false,
}: PushToTalkButtonProps) {
  const { transcribe, isTranscribing, isAudioAvailable } = useAudio();
  const { status, startRecording, stopRecording, isSupported } =
    useAudioRecorder();
  const isActiveRef = useRef(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleStart = useCallback(() => {
    if (disabled || isTranscribing || isProcessing || isActiveRef.current)
      return;
    isActiveRef.current = true;
    startRecording();

    // Listen for mouseup anywhere on the page (in case user moves mouse off button)
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

  const isRecording = status === "recording";
  const isBusy = isTranscribing || isProcessing;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant={isRecording ? "destructive" : "ghost"}
            disabled={disabled || isBusy}
            className={`flex-shrink-0 h-10 w-10 rounded-full ${isRecording ? "animate-pulse" : ""}`}
            onMouseDown={handleStart}
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isBusy ? "Transcribing..." : "Hold to record"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
