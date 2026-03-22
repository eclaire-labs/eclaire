/**
 * AudioPlaybackButton — Synthesize and play assistant message text as audio.
 *
 * Self-contained: checks audio availability internally,
 * renders nothing when unavailable.
 *
 * Supports two modes:
 * - Streaming: plays audio as it's generated (low latency)
 * - Buffered: waits for full synthesis before playback (fallback)
 */

import { Loader2, Square, Volume2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudio } from "@/hooks/use-audio";
import { useStreamingPlayback } from "@/hooks/use-streaming-playback";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";

type PlaybackStatus = "idle" | "synthesizing" | "playing";

interface AudioPlaybackButtonProps {
  text: string;
}

export function AudioPlaybackButton({ text }: AudioPlaybackButtonProps) {
  const { synthesize, isAudioAvailable, isStreamingTtsEnabled } = useAudio();
  const streamingPlayback = useStreamingPlayback();
  const [preferences] = useAssistantPreferences();
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cachedUrlRef = useRef<string | null>(null);

  const useStreaming = isStreamingTtsEnabled && preferences.useStreamingTTS;

  // Derive combined status from both modes
  const combinedStatus = useStreaming
    ? streamingPlayback.status === "loading"
      ? "synthesizing"
      : streamingPlayback.status === "playing"
        ? "playing"
        : status
    : status;

  const handleClick = useCallback(async () => {
    // --- Streaming mode ---
    if (useStreaming) {
      if (streamingPlayback.status === "playing") {
        streamingPlayback.stop();
        return;
      }
      if (streamingPlayback.status !== "idle") return;
      await streamingPlayback.play(text);
      return;
    }

    // --- Buffered mode ---
    if (combinedStatus === "playing" && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setStatus("idle");
      return;
    }

    if (combinedStatus === "synthesizing") return;

    try {
      let url = cachedUrlRef.current;
      if (!url) {
        setStatus("synthesizing");
        url = await synthesize(text);
        cachedUrlRef.current = url;
      }

      setStatus("playing");
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setStatus("idle");
        audioRef.current = null;
      };

      audio.onerror = () => {
        setStatus("idle");
        audioRef.current = null;
        cachedUrlRef.current = null;
      };

      await audio.play();
    } catch (err) {
      setStatus("idle");
      cachedUrlRef.current = null;
      const msg = err instanceof Error ? err.message : "Audio playback failed";
      toast.error("Playback failed", { description: msg });
    }
  }, [useStreaming, streamingPlayback, combinedStatus, text, synthesize]);

  if (!isAudioAvailable || !text.trim()) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 text-muted-foreground/60 hover:text-foreground"
            onClick={handleClick}
            disabled={combinedStatus === "synthesizing"}
          >
            {combinedStatus === "synthesizing" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : combinedStatus === "playing" ? (
              <Square className="h-3 w-3" />
            ) : (
              <Volume2 className="h-3 w-3" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {combinedStatus === "synthesizing"
            ? "Generating audio..."
            : combinedStatus === "playing"
              ? "Stop"
              : "Listen"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
