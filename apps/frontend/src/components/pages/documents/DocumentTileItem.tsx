import {
  CalendarDays,
  Download,
  Edit,
  File as FileIconGeneric,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import type React from "react";
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
import type { Document } from "@/types/document";
import { formatFileSize, getDocumentTypeLabel } from "./documents-config";

// --- File Icon Helper ---

function getFileIcon(
  mimeType: string | null | undefined,
  className = "h-10 w-10",
): React.ReactElement {
  const typeLabel = getDocumentTypeLabel(mimeType).toLowerCase();
  const baseColorClass = "text-muted-foreground";

  if (typeLabel === "pdf")
    return <FileText className={`text-red-500 ${className}`} />;
  if (typeLabel === "word")
    return <FileText className={`text-blue-500 ${className}`} />;
  if (typeLabel === "excel")
    return <FileText className={`text-green-500 ${className}`} />;
  if (typeLabel === "powerpoint")
    return <FileText className={`text-orange-500 ${className}`} />;
  if (typeLabel === "rtf")
    return <FileText className={`text-blue-600 ${className}`} />;
  if (typeLabel === "markdown")
    return <FileText className={`text-indigo-500 ${className}`} />;
  if (typeLabel === "html")
    return <FileText className={`text-orange-600 ${className}`} />;
  if (typeLabel === "csv")
    return <FileText className={`text-emerald-500 ${className}`} />;
  if (typeLabel === "json")
    return <FileText className={`text-yellow-600 ${className}`} />;
  if (typeLabel === "xml")
    return <FileText className={`text-teal-500 ${className}`} />;
  if (typeLabel === "pages")
    return <FileText className={`text-blue-400 ${className}`} />;
  if (typeLabel === "numbers")
    return <FileText className={`text-green-400 ${className}`} />;
  if (typeLabel === "keynote")
    return <FileText className={`text-orange-400 ${className}`} />;
  if (typeLabel === "text")
    return <FileText className={`${baseColorClass} ${className}`} />;

  return <FileIconGeneric className={`${baseColorClass} ${className}`} />;
}

// Re-export for use by DocumentListItem and the page
export { getFileIcon };

// --- Component ---

interface DocumentTileItemProps {
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

export function DocumentTileItem({
  entry,
  index,
  isFocused,
  onClick,
  onEditClick,
  onDeleteClick,
  onPinToggle,
  onFlagColorChange,
  onChatClick,
}: DocumentTileItemProps) {
  const doc = entry;
  const docTypeLabel = getDocumentTypeLabel(doc.mimeType);

  return (
    <Card
      data-index={index}
      tabIndex={-1}
      className={`group cursor-pointer overflow-hidden transition-all duration-200 ease-in-out hover:shadow-lg flex flex-col bg-card outline-none relative ${isFocused ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : ""}`}
      onClick={onClick}
      onDoubleClick={() => onEditClick(doc)}
    >
      {/* Thumbnail Section */}
      {doc.thumbnailUrl ? (
        <div className="aspect-[4/3] bg-muted/30 overflow-hidden relative">
          <img
            src={doc.thumbnailUrl}
            alt={`Thumbnail for ${doc.title}`}
            className="w-full h-full object-contain transition-transform group-hover:scale-105"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              const iconContainer = target.nextElementSibling as HTMLElement;
              if (iconContainer) {
                iconContainer.style.display = "flex";
              }
            }}
          />
          {/* Fallback icon container */}
          <div className="hidden w-full h-full items-center justify-center bg-muted/50">
            {getFileIcon(doc.mimeType, "h-12 w-12")}
          </div>
          {/* Processing Status Icon */}
          <div className="absolute top-2 left-2">
            <SimpleProcessingStatusIcon
              status={doc.processingStatus}
              enabled={doc.enabled}
              className="bg-white/90 dark:bg-black/90 rounded-full p-1"
            />
          </div>
        </div>
      ) : (
        <div className="aspect-[4/3] bg-muted/30 flex items-center justify-center relative">
          {getFileIcon(doc.mimeType, "h-12 w-12")}
          {/* Processing Status Icon */}
          <div className="absolute top-2 left-2">
            <SimpleProcessingStatusIcon
              status={doc.processingStatus}
              enabled={doc.enabled}
              className="bg-white/90 dark:bg-black/90 rounded-full p-1"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <CardHeader className="flex flex-row items-center gap-3 p-4 pb-2">
        {/* Title & Meta */}
        <div className="flex-1 overflow-hidden">
          <CardTitle
            className="text-sm font-semibold line-clamp-1"
            title={doc.title}
          >
            {doc.title}
          </CardTitle>
          <CardDescription
            className="text-xs text-muted-foreground mt-0.5"
            title={`Type: ${docTypeLabel}, Size: ${formatFileSize(doc.fileSize)}`}
          >
            {docTypeLabel} • {formatFileSize(doc.fileSize)}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
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
          {/* Chat Icon */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onChatClick(doc);
            }}
            title="Chat about this document"
          >
            <MessageSquare className="h-3 w-3 text-gray-400" />
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
              <DropdownMenuItem onClick={() => onEditClick(doc)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              {doc.fileUrl && (
                <DropdownMenuItem asChild>
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={doc.originalFilename}
                    onClick={() =>
                      toast.success("Download Started", {
                        description: `Downloading ${doc.originalFilename}`,
                      })
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDeleteClick(doc)}
                className="text-red-500"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-1 space-y-1.5 flex-grow">
        {/* Description */}
        {doc.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {doc.description}
          </p>
        )}
        {/* Date Added */}
        <div
          className="text-xs flex items-center gap-1 text-muted-foreground"
          title={`Added: ${formatDate(doc.createdAt)}`}
        >
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span>{formatDate(doc.createdAt)}</span>
        </div>
        {/* Tags */}
        {doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {doc.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1.5 py-0.5 font-normal"
              >
                {tag}
              </Badge>
            ))}
            {doc.tags.length > 3 && (
              <Badge
                variant="outline"
                className="text-xs px-1.5 py-0.5 font-normal"
              >
                +{doc.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
        {!doc.description && doc.tags.length === 0 && (
          <p className="text-xs italic text-muted-foreground/60 pt-1">
            No description or tags.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
