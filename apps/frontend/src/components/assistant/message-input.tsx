// components/chat/message-input.tsx

import type { SlashItem } from "@eclaire/core/slash";
import {
  Bookmark,
  CheckSquare,
  FileText,
  Mic,
  Monitor,
  Send,
  StickyNote,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { PushToTalkButton } from "@/components/assistant/push-to-talk-button";
import { SlashPalette } from "@/components/assistant/slash-palette";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import type { AssetReference } from "@/types/message";

interface SlashPaletteProps {
  open: boolean;
  items: SlashItem[];
  onSelect: (item: SlashItem) => void;
  onClose: () => void;
}

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  attachedAssets: AssetReference[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<AssetReference[]>>;
  onStopAutoPlay?: () => void;
  slashPalette?: SlashPaletteProps;
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  isLoading,
  attachedAssets,
  setAttachedAssets,
  onStopAutoPlay,
  slashPalette,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [partialTranscription, setPartialTranscription] = useState<
    string | null
  >(null);
  const [preferences] = useAssistantPreferences();

  // Auto-grow textarea based on content
  // biome-ignore lint/correctness/useExhaustiveDependencies: value triggers resize recalculation
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim() || isLoading) return;
    onSubmit(value);
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case "document":
        return <FileText className="h-3 w-3" />;
      case "bookmark":
        return <Bookmark className="h-3 w-3" />;
      case "photo":
        return <Monitor className="h-3 w-3" />;
      case "note":
        return <StickyNote className="h-3 w-3" />;
      case "task":
        return <CheckSquare className="h-3 w-3" />;
      default:
        return <FileText className="h-3 w-3" />;
    }
  };

  return (
    <div className="p-3">
      {/* Attached assets display */}
      {attachedAssets.length > 0 && (
        <div className="mb-3 p-3 bg-muted/30 rounded-lg">
          <div className="text-xs text-muted-foreground mb-2">
            Attached to conversation:
          </div>
          <div className="flex flex-wrap gap-1">
            {attachedAssets.map((asset, index) => (
              <Badge
                key={`${asset.type}-${asset.id}`}
                variant="secondary"
                className="text-xs px-2 py-1"
              >
                <div className="flex items-center gap-1">
                  {getAssetIcon(asset.type)}
                  <span>{asset.title || `${asset.type} ${asset.id}`}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-3 w-3 ml-1 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => {
                      setAttachedAssets((prev) =>
                        prev.filter((_, i) => i !== index),
                      );
                    }}
                  >
                    <X className="h-2 w-2" />
                  </Button>
                </div>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Partial transcription display */}
      {partialTranscription && (
        <div className="px-3 pb-2 text-sm text-muted-foreground italic flex items-center gap-1.5">
          <Mic className="h-3 w-3 animate-pulse text-destructive flex-shrink-0" />
          <span>{partialTranscription}</span>
        </div>
      )}

      {/* Input form with slash palette */}
      <div className="relative">
        {slashPalette && (
          <SlashPalette
            open={slashPalette.open}
            items={slashPalette.items}
            onSelect={slashPalette.onSelect}
            onClose={slashPalette.onClose}
          />
        )}
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type your message..."
            disabled={isLoading}
            className="flex-1 min-h-[40px] max-h-[120px] resize-none py-2.5 text-sm"
            rows={1}
          />
          <PushToTalkButton
            onTranscription={(text) => {
              setPartialTranscription(null);
              if (preferences.voiceMode) {
                // Auto-send: submit transcription directly
                onSubmit(text);
              } else {
                // Manual mode: append to input for review
                onChange(value + (value ? " " : "") + text);
              }
            }}
            onPartialTranscription={setPartialTranscription}
            disabled={isLoading}
            onStopAutoPlay={onStopAutoPlay}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !value.trim()}
            className="flex-shrink-0 h-10 w-10 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export default MessageInput;
