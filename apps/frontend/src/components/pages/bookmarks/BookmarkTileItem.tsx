import {
  CalendarDays,
  Edit,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
import { PinFlagControls } from "@/components/shared/pin-flag-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import type { Bookmark } from "@/types/bookmark";
import { getDomainFromUrl } from "./bookmarks-config";
import { Favicon } from "./Favicon";

interface BookmarkTileItemProps {
  entry: Bookmark;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (entry: Bookmark) => void;
  onDeleteClick: (entry: Bookmark) => void;
  onPinToggle: (entry: Bookmark) => void;
  onFlagColorChange: (entry: Bookmark, color: FlagColor) => void;
  onChatClick: (entry: Bookmark) => void;
}

export function BookmarkTileItem({
  entry,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: BookmarkTileItemProps) {
  const thumbnailUrl = entry.thumbnailUrl;

  return (
    <Card
      data-index={index}
      tabIndex={-1}
      className={`group cursor-pointer overflow-hidden transition-all duration-200 ease-in-out hover:shadow-md flex flex-col bg-card outline-none h-full ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(entry)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-muted overflow-hidden rounded-t-lg flex-shrink-0">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Thumbnail of ${entry.title}`}
            className="object-cover w-full h-full"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              const fallbackDiv = target.nextElementSibling as HTMLElement;
              if (fallbackDiv) {
                fallbackDiv.style.display = "flex";
              }
            }}
          />
        ) : null}
        {/* Fallback icon container */}
        <div
          className={`${thumbnailUrl ? "hidden" : "flex"} items-center justify-center w-full h-full bg-muted`}
        >
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>

        {/* Processing Status Icon */}
        <div className="absolute top-2 left-2">
          <SimpleProcessingStatusIcon
            status={entry.processingStatus}
            processingEnabled={entry.processingEnabled}
            className="bg-white/90 dark:bg-black/90 rounded-full p-1"
          />
        </div>
      </div>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle
              className="text-sm font-semibold line-clamp-2"
              title={entry.title || entry.url}
            >
              {entry.title || entry.url}
            </CardTitle>
            <CardDescription className="flex items-center text-xs text-muted-foreground mt-1">
              <Favicon
                bookmark={entry}
                className="mr-1.5 h-4 w-4 flex-shrink-0"
              />
              <span className="truncate">{getDomainFromUrl(entry.url)}</span>
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <PinFlagControls
              isPinned={entry.isPinned || false}
              flagColor={entry.flagColor}
              onPinToggle={() => onPinToggle(entry)}
              onFlagToggle={() =>
                onFlagColorChange(entry, entry.flagColor ? null : "orange")
              }
              onFlagColorChange={(color) => onFlagColorChange(entry, color)}
              size="sm"
            />
            {/* Chat Icon */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onChatClick(entry);
              }}
              title="Chat about this bookmark"
            >
              <MessageCircle className="h-3 w-3 text-muted-foreground" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem onClick={() => onClick()}>
                  <FileText className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => window.open(entry.url, "_blank")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEditClick(entry)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDeleteClick(entry)}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex-grow space-y-1.5">
        {entry.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {entry.description}
          </p>
        )}
        <div className="text-xs flex items-center gap-1 text-muted-foreground">
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span>{formatDate(entry.createdAt)}</span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-1 p-4 pt-0">
        {entry.tags.slice(0, 3).map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-xs px-1.5 py-0.5 font-normal"
          >
            {tag}
          </Badge>
        ))}
        {entry.tags.length > 3 && (
          <Badge
            variant="outline"
            className="text-xs px-1.5 py-0.5 font-normal"
          >
            +{entry.tags.length - 3}
          </Badge>
        )}
      </CardFooter>
    </Card>
  );
}
