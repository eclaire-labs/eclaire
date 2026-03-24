import {
  AudioWaveform,
  Download,
  Edit,
  FileText,
  MessageCircle,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FlagColor } from "@/hooks/use-list-page-state";
import { formatDate } from "@/lib/list-page-utils";
import type { Media } from "@/types/media";
import { formatDuration, formatFileSize } from "./media-utils";

interface MediaListItemProps {
  media: Media;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (media: Media) => void;
  onDeleteClick: (media: Media) => void;
  onPinToggle: (media: Media) => void;
  onFlagColorChange: (media: Media, color: FlagColor) => void;
  onChatClick: (media: Media) => void;
}

export function MediaListItem({
  media,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: MediaListItemProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: complex flex layout not suited for button element
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      tabIndex={-1}
      data-index={index}
      className={`flex items-center px-4 py-2 hover:bg-muted/50 cursor-pointer outline-none ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background bg-muted/50" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(media)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Thumbnail */}
      <div className="w-16 h-12 flex-shrink-0 mr-4 bg-muted rounded overflow-hidden relative">
        {media.thumbnailUrl ? (
          <img
            src={media.thumbnailUrl}
            alt={media.title}
            className="object-cover w-full h-full"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              const retryCount = parseInt(img.dataset.retryCount || "0", 10);
              if (retryCount < 1) {
                img.dataset.retryCount = String(retryCount + 1);
                img.src = "/placeholder.svg";
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <AudioWaveform className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        {/* Processing Status Icon */}
        <div className="absolute top-1 right-1">
          <SimpleProcessingStatusIcon
            status={media.processingStatus}
            processingEnabled={media.processingEnabled}
            className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
          />
        </div>
      </div>
      {/* Title & Tags */}
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium truncate" title={media.title}>
          {media.title}
        </p>
        {media.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {media.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1 py-0 font-normal"
              >
                {tag}
              </Badge>
            ))}
            {media.tags.length > 2 && (
              <Badge
                variant="outline"
                className="text-xs px-1 py-0 font-normal"
              >
                +{media.tags.length - 2}
              </Badge>
            )}
          </div>
        )}
      </div>
      {/* Duration */}
      <div className="w-24 hidden md:block mr-4 text-sm text-muted-foreground">
        {formatDuration(media.duration)}
      </div>
      {/* Date Added */}
      <div className="w-32 hidden lg:block mr-4 text-sm text-muted-foreground">
        {formatDate(media.createdAt)}
      </div>
      {/* Size */}
      <div className="w-24 hidden sm:block mr-4 text-sm text-muted-foreground">
        {formatFileSize(media.fileSize)}
      </div>
      {/* Pin/Flag Controls */}
      <div className="w-16 flex items-center justify-end gap-1 flex-shrink-0 mr-3">
        <PinFlagControls
          isPinned={media.isPinned || false}
          flagColor={media.flagColor}
          onPinToggle={() => onPinToggle(media)}
          onFlagToggle={() =>
            onFlagColorChange(media, media.flagColor ? null : "orange")
          }
          onFlagColorChange={(color) => onFlagColorChange(media, color)}
          size="sm"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onChatClick(media);
          }}
          title="Chat about this media"
        >
          <MessageCircle className="h-3 w-3 text-muted-foreground" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onClick()}>
              <FileText className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditClick(media)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.open(media.mediaUrl, "_blank");
                toast.success("Opening Media", {
                  description: `Opening ${media.originalFilename} in a new tab. You can save it from there.`,
                });
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteClick(media)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
