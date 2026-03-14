/**
 * AudioPlaybackButton — Synthesize and play assistant message text as audio.
 *
 * Self-contained: checks audio availability internally,
 * renders nothing when unavailable.
 */

import { Loader2, Square, Volume2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudio } from "@/hooks/use-audio";

type PlaybackStatus = "idle" | "synthesizing" | "playing";

interface AudioPlaybackButtonProps {
  text: string;
}

export function AudioPlaybackButton({ text }: AudioPlaybackButtonProps) {
  const { synthesize, isAudioAvailable } = useAudio();
  const [status, setStatus] = useState<PlaybackStatus>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cachedUrlRef = useRef<string | null>(null);

  const handleClick = useCallback(async () => {
    // If currently playing, stop
    if (status === "playing" && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setStatus("idle");
      return;
    }

    if (status === "synthesizing") return;

    try {
      // Use cached URL if available
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
        // Clear cache on error so next attempt re-synthesizes
        cachedUrlRef.current = null;
      };

      await audio.play();
    } catch {
      setStatus("idle");
      cachedUrlRef.current = null;
    }
  }, [status, text, synthesize]);

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
            disabled={status === "synthesizing"}
          >
            {status === "synthesizing" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : status === "playing" ? (
              <Square className="h-3 w-3" />
            ) : (
              <Volume2 className="h-3 w-3" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {status === "synthesizing"
            ? "Generating audio..."
            : status === "playing"
              ? "Stop"
              : "Listen"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
