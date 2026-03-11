import {
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
import type { Photo } from "@/types/photo";
import { formatFileSize, formatLocation } from "./photo-utils";

interface PhotoListItemProps {
  photo: Photo;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (photo: Photo) => void;
  onDeleteClick: (photo: Photo) => void;
  onPinToggle: (photo: Photo) => void;
  onFlagColorChange: (photo: Photo, color: FlagColor) => void;
  onChatClick: (photo: Photo) => void;
}

export function PhotoListItem({
  photo,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: PhotoListItemProps) {
  const locationString = formatLocation(
    photo.locationCity,
    photo.locationCountryName,
  );
  const imgSrc = photo.thumbnailUrl || "/placeholder.svg";

  return (
    // biome-ignore lint/a11y/useSemanticElements: complex flex layout not suited for button element
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      tabIndex={-1}
      data-index={index}
      className={`flex items-center px-4 py-2 hover:bg-muted/50 cursor-pointer outline-none ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background bg-muted/50" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(photo)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Thumbnail */}
      <div className="w-16 h-12 flex-shrink-0 mr-4 bg-muted rounded overflow-hidden relative">
        <img
          src={imgSrc}
          alt={photo.title}
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
        {/* Processing Status Icon */}
        <div className="absolute top-1 right-1">
          <SimpleProcessingStatusIcon
            status={photo.processingStatus}
            processingEnabled={photo.processingEnabled}
            className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
          />
        </div>
      </div>
      {/* Title & Tags */}
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium truncate" title={photo.title}>
          {photo.title}
        </p>
        {photo.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {photo.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1 py-0 font-normal"
              >
                {tag}
              </Badge>
            ))}
            {photo.tags.length > 2 && (
              <Badge
                variant="outline"
                className="text-xs px-1 py-0 font-normal"
              >
                +{photo.tags.length - 2}
              </Badge>
            )}
          </div>
        )}
      </div>
      {/* Date Taken */}
      <div className="w-32 hidden md:block mr-4 text-sm text-muted-foreground">
        {formatDate(photo.dateTaken)}
      </div>
      {/* Date Added */}
      <div className="w-32 hidden lg:block mr-4 text-sm text-muted-foreground">
        {formatDate(photo.createdAt)}
      </div>
      {/* Location */}
      <div
        className="w-40 hidden md:block mr-4 text-sm text-muted-foreground truncate"
        title={locationString ?? ""}
      >
        {locationString ?? "-"}
      </div>
      {/* Size */}
      <div className="w-24 hidden sm:block mr-4 text-sm text-muted-foreground">
        {formatFileSize(photo.fileSize)}
      </div>
      {/* Pin/Flag Controls */}
      <div className="w-16 flex items-center justify-end gap-1 flex-shrink-0 mr-3">
        <PinFlagControls
          isPinned={photo.isPinned || false}
          flagColor={photo.flagColor}
          onPinToggle={() => onPinToggle(photo)}
          onFlagToggle={() =>
            onFlagColorChange(photo, photo.flagColor ? null : "orange")
          }
          onFlagColorChange={(color) => onFlagColorChange(photo, color)}
          size="sm"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onChatClick(photo);
          }}
          title="Chat about this photo"
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
            <DropdownMenuItem onClick={() => onEditClick(photo)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                window.open(photo.imageUrl, "_blank");
                toast.success("Opening Image", {
                  description: `Opening ${photo.originalFilename} in a new tab. You can save it from there.`,
                });
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteClick(photo)}
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
