import { AlertCircle, FileText, Loader2 } from "lucide-react";
import { useContentFetch } from "@/hooks/use-content-fetch";
import { MarkdownDisplay } from "@/components/markdown-display";

interface ContentViewerProps {
  contentUrl: string | null;
  isActive: boolean;
}

/**
 * Fetches and renders extracted markdown content for documents and bookmarks.
 * Only loads content when `isActive` is true (e.g., when the Content tab is selected).
 */
export function ContentViewer({ contentUrl, isActive }: ContentViewerProps) {
  const { content, isLoading, error } = useContentFetch(contentUrl, isActive);

  if (!contentUrl) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <FileText className="h-8 w-8 mb-2" />
        <p className="text-sm">No extracted content available.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p className="text-sm">Failed to load content.</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <FileText className="h-8 w-8 mb-2" />
        <p className="text-sm">Content is empty.</p>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto max-h-[60vh] pr-2">
      <MarkdownDisplay content={content} skipLinkDetection />
    </div>
  );
}
