import {
  CalendarDays,
  Edit,
  FileText,
  MessageCircle,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";
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
import type { Note } from "@/types/note";

interface NoteTileItemProps {
  entry: Note;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (entry: Note) => void;
  onDeleteClick: (entry: Note) => void;
  onPinToggle: (entry: Note) => void;
  onFlagColorChange: (entry: Note, color: FlagColor) => void;
  onChatClick: (entry: Note) => void;
}

export function NoteTileItem({
  entry,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: NoteTileItemProps) {
  return (
    <Card
      data-index={index}
      tabIndex={-1}
      className={`group cursor-pointer overflow-hidden transition-all duration-200 ease-in-out hover:shadow-md flex flex-col bg-card outline-none h-full ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(entry)}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <CardTitle
              className="text-sm font-semibold line-clamp-2"
              title={entry.title}
            >
              {entry.title}
            </CardTitle>
            <CardDescription className="flex items-center text-xs text-muted-foreground mt-1">
              <CalendarDays className="mr-1 h-3 w-3 flex-shrink-0" />
              {formatDate(entry.createdAt)}
              <div className="ml-2">
                <SimpleProcessingStatusIcon
                  status={entry.processingStatus}
                  processingEnabled={entry.processingEnabled}
                  className=""
                />
              </div>
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <PinFlagControls
              size="sm"
              isPinned={entry.isPinned}
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
              className="h-6 w-6 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onChatClick(entry);
              }}
              title="Chat about this note"
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
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onClick();
                  }}
                >
                  <FileText className="mr-2 h-4 w-4" /> View Details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditClick(entry);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(entry);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex-grow">
        <div className="line-clamp-3 mb-3">
          <MarkdownPreview
            content={entry.content}
            maxLength={200}
            preserveFormatting={true}
          />
        </div>
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
