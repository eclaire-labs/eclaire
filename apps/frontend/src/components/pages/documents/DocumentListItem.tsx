import {
  Download,
  Edit,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { SimpleProcessingStatusIcon } from "@/components/processing/SimpleProcessingStatusIcon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PinFlagControls } from "@/components/ui/pin-flag-controls";
import type { FlagColor } from "@/hooks/use-list-page-state";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/list-page-utils";
import type { Document } from "@/types/document";
import {
  formatFileSize,
  getDocumentTypeLabel,
} from "./documents-config";
import { getFileIcon } from "./DocumentTileItem";

interface DocumentListItemProps {
  entry: Document;
  index: number;
  isFocused: boolean;
  onClick: () => void;
  onEditClick: (entry: Document) => void;
  onDeleteClick: (entry: Document) => void;
  onPinToggle: (entry: Document) => void;
  onFlagColorChange: (entry: Document, color: FlagColor) => void;
  onChatClick: (entry: Document) => void;
}

export function DocumentListItem({
  entry,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: DocumentListItemProps) {
  const { toast } = useToast();
  const doc = entry;
  const docTypeLabel = getDocumentTypeLabel(doc.mimeType);

  return (
    // biome-ignore lint/a11y/useSemanticElements: complex flex layout not suited for button element
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="button"
      tabIndex={-1}
      data-index={index}
      className={`flex items-center px-4 py-2.5 hover:bg-muted/50 cursor-pointer outline-none ${isFocused ? "ring-2 ring-ring ring-offset-0 bg-muted/50" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(doc)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Icon/Thumbnail */}
      <div className="w-10 flex-shrink-0 mr-3 flex items-center justify-center">
        {doc.thumbnailUrl ? (
          <div className="relative w-8 h-8">
            <img
              src={doc.thumbnailUrl}
              alt={`Thumbnail for ${doc.title}`}
              className="w-8 h-8 object-cover rounded border"
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                const iconContainer =
                  target.nextElementSibling as HTMLElement;
                if (iconContainer) {
                  iconContainer.style.display = "block";
                }
              }}
            />
            <div className="hidden">
              {getFileIcon(doc.mimeType, "h-8 w-8")}
            </div>
            {/* Processing Status Icon */}
            <div className="absolute top-0 right-0">
              <SimpleProcessingStatusIcon
                status={doc.processingStatus}
                enabled={doc.enabled}
                className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
              />
            </div>
          </div>
        ) : (
          <div className="relative">
            {getFileIcon(doc.mimeType, "h-8 w-8")}
            {/* Processing Status Icon */}
            <div className="absolute -top-1 -right-1">
              <SimpleProcessingStatusIcon
                status={doc.processingStatus}
                enabled={doc.enabled}
                className="bg-white/90 dark:bg-black/90 rounded-full p-0.5"
              />
            </div>
          </div>
        )}
      </div>
      {/* Title & Description */}
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium truncate" title={doc.title}>
          {doc.title}
        </p>
        {doc.description && (
          <p
            className="text-xs text-muted-foreground truncate"
            title={doc.description}
          >
            {doc.description}
          </p>
        )}
      </div>
      {/* Date Added */}
      <div className="w-32 hidden md:block mr-4 text-sm text-muted-foreground">
        {formatDate(doc.createdAt)}
      </div>
      {/* Type */}
      <div
        className="w-28 hidden sm:block mr-4 text-sm text-muted-foreground"
        title={doc.mimeType || undefined}
      >
        {docTypeLabel}
      </div>
      {/* Size */}
      <div className="w-24 hidden sm:block mr-4 text-sm text-muted-foreground">
        {formatFileSize(doc.fileSize)}
      </div>
      {/* Tags */}
      <div className="w-40 hidden lg:flex flex-wrap gap-1 items-center mr-4">
        {doc.tags.slice(0, 2).map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-xs px-1 py-0 font-normal"
          >
            {tag}
          </Badge>
        ))}
        {doc.tags.length > 2 && (
          <Badge
            variant="outline"
            className="text-xs px-1 py-0 font-normal"
          >
            +{doc.tags.length - 2}
          </Badge>
        )}
        {doc.tags.length === 0 && (
          <span className="text-xs text-muted-foreground italic">
            No tags
          </span>
        )}
      </div>
      {/* Pin/Flag Controls & Actions */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click handler only stops propagation to parent row */}
      <div
        role="presentation"
        className="w-20 flex items-center justify-end gap-1 flex-shrink-0 mr-3"
        onClick={(e) => e.stopPropagation()}
      >
        <PinFlagControls
          isPinned={doc.isPinned || false}
          flagColor={doc.flagColor}
          onPinToggle={() => onPinToggle(doc)}
          onFlagToggle={() =>
            onFlagColorChange(doc, doc.flagColor ? null : "orange")
          }
          onFlagColorChange={(color) => onFlagColorChange(doc, color)}
          size="sm"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onChatClick(doc);
          }}
          title="Chat about this document"
        >
          <MessageSquare className="h-3 w-3 text-gray-400" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            asChild
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem onClick={() => onClick()}>
              <FileText className="mr-2 h-4 w-4" /> View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditClick(doc)}>
              <Edit className="mr-2 h-4 w-4" /> Edit Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onChatClick(doc)}>
              <MessageSquare className="mr-2 h-4 w-4" /> Chat with AI
            </DropdownMenuItem>
            {doc.fileUrl && (
              <DropdownMenuItem asChild>
                <a
                  href={doc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...(doc.originalFilename && {
                    download: doc.originalFilename as string,
                  })}
                  onClick={() => toast({ title: "Download Started" })}
                >
                  <Download className="mr-2 h-4 w-4" /> Download File
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteClick(doc)}
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
