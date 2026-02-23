import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  CheckSquare,
  ExternalLink,
  FileText,
  Monitor,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContentLink } from "@/types/message";

interface ContentLinkPreviewProps {
  link: ContentLink;
}

export const ContentLinkPreview = ({ link }: ContentLinkPreviewProps) => {
  const getIcon = () => {
    switch (link.type) {
      case "bookmark":
        return <Bookmark className="h-4 w-4" />;
      case "document":
        return <FileText className="h-4 w-4" />;
      case "photo":
        return <Monitor className="h-4 w-4" />;
      case "note":
        return <StickyNote className="h-4 w-4" />;
      case "task":
        return <CheckSquare className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getDisplayContent = () => {
    // Helper to safely access string metadata fields
    const meta = (key: string): string | undefined => {
      const v = link.metadata?.[key];
      return typeof v === "string" ? v : undefined;
    };

    switch (link.type) {
      case "bookmark": {
        const originalUrl = meta("originalUrl");
        return {
          title: link.title || "Untitled Bookmark",
          subtitle: originalUrl ? new URL(originalUrl).hostname : undefined,
          showFavicon: !!meta("faviconStorageId"),
          faviconUrl: meta("faviconStorageId")
            ? `/api/storage/${meta("faviconStorageId")}`
            : undefined,
        };
      }

      case "document":
        return {
          title: link.title || "Untitled Document",
          subtitle: meta("originalFilename"),
        };

      case "photo":
        return {
          title: link.title || "Untitled Photo",
          subtitle: meta("originalFilename"),
        };

      case "task": {
        const status = meta("status");
        return {
          title: link.title || "Untitled Task",
          subtitle: status ? `Status: ${status.replace("-", " ")}` : undefined,
        };
      }

      case "note": {
        // For notes: show title if available, otherwise show content preview
        const title =
          link.title && link.title !== "Untitled Note" ? link.title : undefined;
        const content = meta("content");
        const contentPreview = content
          ? content.substring(0, 60) + (content.length > 60 ? "..." : "")
          : undefined;

        return {
          title: title || contentPreview || "Untitled Note",
          subtitle: title && contentPreview ? contentPreview : undefined,
        };
      }

      default:
        return {
          title: link.title || `${link.type} ${link.id}`,
          subtitle: undefined,
        };
    }
  };

  const { title, subtitle, showFavicon, faviconUrl } = getDisplayContent();

  return (
    <Button
      variant="outline"
      className="mt-1.5 w-full justify-start h-auto p-2.5 text-left"
      asChild
    >
      <Link to={link.url}>
        <div className="flex items-center gap-2.5 w-full min-w-0">
          <div className="flex-shrink-0 flex items-center">
            {showFavicon && faviconUrl ? (
              <img
                src={faviconUrl}
                alt="Favicon"
                className="h-4 w-4"
                onError={(e) => {
                  // Fallback to type icon if favicon fails to load
                  e.currentTarget.style.display = "none";
                  e.currentTarget.nextElementSibling?.classList.remove(
                    "hidden",
                  );
                }}
              />
            ) : null}
            <div className={showFavicon && faviconUrl ? "hidden" : ""}>
              {getIcon()}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{title}</div>
            {subtitle && (
              <div className="text-xs text-muted-foreground truncate">
                {subtitle}
              </div>
            )}
          </div>
          <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        </div>
      </Link>
    </Button>
  );
};
