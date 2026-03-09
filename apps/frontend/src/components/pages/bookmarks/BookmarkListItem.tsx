import {
  Edit,
  ExternalLink,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
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
import type { Bookmark } from "@/types/bookmark";
import { getDomainFromUrl } from "./bookmarks-config";
import { Favicon } from "./Favicon";

interface BookmarkListItemProps {
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

export function BookmarkListItem({
  entry,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: BookmarkListItemProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: complex flex layout not suited for button element
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      tabIndex={-1}
      data-index={index}
      className={`flex items-center px-4 py-2.5 hover:bg-muted/50 cursor-pointer outline-none ${isFocused ? "ring-2 ring-ring ring-offset-0 bg-muted/50" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Favicon */}
      <div className="w-10 flex-shrink-0 mr-3 flex items-center justify-center relative">
        <Favicon bookmark={entry} className="h-6 w-6" />
        {/* Processing Status Icon */}
        <div className="absolute -top-1 -right-1">
          <SimpleProcessingStatusIcon
            status={entry.processingStatus}
            enabled={entry.enabled}
            className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
          />
        </div>
      </div>
      {/* Title & URL */}
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium truncate" title={entry.title || ""}>
          {entry.title || "Untitled"}
        </p>
        <p className="text-xs text-muted-foreground truncate" title={entry.url}>
          {entry.url}
        </p>
      </div>
      {/* Domain */}
      <div className="w-40 hidden md:block mr-4 text-sm text-muted-foreground truncate">
        {getDomainFromUrl(entry.url)}
      </div>
      {/* Date */}
      <div className="w-32 hidden sm:block mr-4 text-sm text-muted-foreground">
        {formatDate(entry.createdAt)}
      </div>
      {/* Tags */}
      <div className="w-32 hidden lg:flex flex-wrap gap-1 items-center mr-4">
        {entry.tags.slice(0, 2).map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-xs px-1 py-0 font-normal"
          >
            {tag}
          </Badge>
        ))}
        {entry.tags.length > 2 && (
          <Badge variant="outline" className="text-xs px-1 py-0 font-normal">
            +{entry.tags.length - 2}
          </Badge>
        )}
      </div>
      {/* Pin/Flag Controls */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click handler only stops propagation to parent row */}
      <div
        role="presentation"
        className="w-16 flex-shrink-0 mr-3 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <PinFlagControls
          size="sm"
          isPinned={entry.isPinned || false}
          flagColor={entry.flagColor}
          onPinToggle={() => onPinToggle(entry)}
          onFlagToggle={() =>
            onFlagColorChange(entry, entry.flagColor ? null : "orange")
          }
          onFlagColorChange={(color) => onFlagColorChange(entry, color)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            onChatClick(entry);
          }}
          title="Chat about this bookmark"
        >
          <MessageSquare className="h-3 w-3 text-gray-400" />
        </Button>
      </div>
      {/* Actions */}
      <div className="w-10 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onClick()}>
              <FileText className="mr-2 h-4 w-4" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(entry.url, "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditClick(entry)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteClick(entry)}
              className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
