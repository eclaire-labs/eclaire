
import {
  Bookmark,
  CheckSquare,
  ExternalLink,
  FileText,
  Monitor,
  StickyNote,
} from "lucide-react";
import { Link } from "@/lib/navigation";
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
    switch (link.type) {
      case "bookmark":
        return {
          title: link.title || "Untitled Bookmark",
          subtitle: link.metadata?.originalUrl
            ? new URL(link.metadata.originalUrl).hostname
            : undefined,
          showFavicon: !!link.metadata?.faviconStorageId,
          faviconUrl: link.metadata?.faviconStorageId
            ? `/api/storage/${link.metadata.faviconStorageId}`
            : undefined,
        };

      case "document":
        return {
          title: link.title || "Untitled Document",
          subtitle: link.metadata?.originalFilename || undefined,
        };

      case "photo":
        return {
          title: link.title || "Untitled Photo",
          subtitle: link.metadata?.originalFilename || undefined,
        };

      case "task":
        return {
          title: link.title || "Untitled Task",
          subtitle: link.metadata?.status
            ? `Status: ${link.metadata.status.replace("-", " ")}`
            : undefined,
        };

      case "note": {
        // For notes: show title if available, otherwise show content preview
        const title =
          link.title && link.title !== "Untitled Note" ? link.title : undefined;
        const contentPreview = link.metadata?.content
          ? link.metadata.content.substring(0, 60) +
            (link.metadata.content.length > 60 ? "..." : "")
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
      <Link href={link.url}>
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
