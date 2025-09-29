// components/chat/message-input.tsx

import {
  Bookmark,
  CheckSquare,
  FileText,
  Monitor,
  Send,
  StickyNote,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssetReference } from "@/types/message";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isLoading: boolean;
  attachedAssets: AssetReference[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<AssetReference[]>>;
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  isLoading,
  attachedAssets,
  setAttachedAssets,
}: MessageInputProps) {
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
    <div className="p-4">
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

      {/* Input form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type your message..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || !value.trim()}
          className="flex-shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export default MessageInput;
