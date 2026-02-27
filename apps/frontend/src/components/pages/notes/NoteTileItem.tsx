import {
  CalendarDays,
  Edit,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { MarkdownPreview } from "@/components/markdown-preview";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
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
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
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
      className={`cursor-pointer transition-shadow hover:shadow-md group relative ${isFocused ? "ring-2 ring-ring ring-offset-2" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(entry)}
    >
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <CardTitle className="line-clamp-1" title={entry.title}>
              {entry.title}
            </CardTitle>
            <CardDescription className="flex items-center text-xs text-muted-foreground mt-1">
              <CalendarDays className="mr-1 h-3 w-3 flex-shrink-0" />
              {formatDate(entry.createdAt)}
              <div className="ml-2">
                <SimpleProcessingStatusIcon
                  status={entry.processingStatus}
                  enabled={entry.enabled}
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
              <MessageSquare className="h-3 w-3 text-gray-400" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
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
      <CardContent>
        <div className="line-clamp-3 mb-3">
          <MarkdownPreview
            content={entry.content}
            maxLength={200}
            preserveFormatting={true}
          />
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {entry.tags.length > 0 && (
            <>
              {entry.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {entry.tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{entry.tags.length - 3}
                </Badge>
              )}
            </>
          )}
          {entry.enabled === false ? (
            <Badge variant="outline" className="text-xs">
              disabled
            </Badge>
          ) : (
            entry.processingStatus &&
            entry.processingStatus !== "completed" && (
              <Badge
                variant={
                  entry.processingStatus === "failed"
                    ? "destructive"
                    : "secondary"
                }
                className="text-xs"
              >
                {entry.processingStatus}
              </Badge>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
