import {
  CalendarDays,
  Download,
  Edit,
  FileText,
  Image as ImageIcon,
  MapPin,
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { formatLocation } from "./photo-utils";

interface PhotoTileItemProps {
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

export function PhotoTileItem({
  photo,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: PhotoTileItemProps) {
  const locationString = formatLocation(
    photo.locationCity,
    photo.locationCountryName,
  );
  const displayDate = formatDate(photo.dateTaken ?? photo.createdAt);

  return (
    <Card
      data-index={index}
      tabIndex={-1}
      className={`group cursor-pointer overflow-hidden transition-all duration-200 ease-in-out hover:shadow-md flex flex-col bg-card outline-none h-full ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(photo)}
    >
      <CardHeader className="p-0">
        <div className="aspect-square relative overflow-hidden bg-muted">
          {photo.thumbnailUrl ? (
            <img
              src={photo.thumbnailUrl}
              alt={photo.title}
              className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                const retryCount = parseInt(img.dataset.retryCount || "0", 10);
                if (retryCount < 1) {
                  img.dataset.retryCount = String(retryCount + 1);
                  img.src = "/placeholder.svg";
                  img.classList.add("opacity-50");
                }
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

          {/* Processing Status Icon */}
          <div className="absolute top-2 left-2">
            <SimpleProcessingStatusIcon
              status={photo.processingStatus}
              processingEnabled={photo.processingEnabled}
              className="bg-white/90 dark:bg-black/90 rounded-full p-1"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-1.5 flex-grow">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 overflow-hidden">
            <CardTitle
              className="text-sm font-semibold line-clamp-2"
              title={photo.title}
            >
              {photo.title}
            </CardTitle>
            <CardDescription
              className="text-xs flex items-center gap-1 text-muted-foreground mt-0.5"
              title={displayDate}
            >
              <CalendarDays className="h-3 w-3 flex-shrink-0" />
              <span>{displayDate}</span>
            </CardDescription>
            {locationString && (
              <CardDescription
                className="text-xs flex items-center gap-1 text-muted-foreground mt-0.5"
                title={locationString}
              >
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="line-clamp-1">{locationString}</span>
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={onClick}>
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
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {photo.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {photo.tags.slice(0, 3).map((tag: string) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1.5 py-0.5 font-normal"
              >
                {tag}
              </Badge>
            ))}
            {photo.tags.length > 3 && (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0.5 font-normal"
              >
                +{photo.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
