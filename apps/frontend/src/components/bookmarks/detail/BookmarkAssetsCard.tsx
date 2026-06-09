import {
  BookOpen,
  Download,
  FileText,
  Globe,
  Monitor,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { normalizeApiUrl } from "@/lib/api-client";
import type { Bookmark } from "@/types/bookmark";

/** Sidebar card listing downloadable bookmark assets (screenshots + content). */
export function BookmarkAssetsCard({ bookmark }: { bookmark: Bookmark }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        {/* Screenshots */}
        <div>
          <Label>Screenshots</Label>
          <div className="space-y-2 mt-1">
            {bookmark.screenshotUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                asChild
              >
                <a
                  href={normalizeApiUrl(bookmark.screenshotUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Monitor className="mr-2 h-4 w-4" />
                  Desktop View
                </a>
              </Button>
            )}
            {bookmark.screenshotMobileUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                asChild
              >
                <a
                  href={normalizeApiUrl(bookmark.screenshotMobileUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Smartphone className="mr-2 h-4 w-4" />
                  Mobile View
                </a>
              </Button>
            )}
            {bookmark.screenshotFullPageUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                asChild
              >
                <a
                  href={normalizeApiUrl(bookmark.screenshotFullPageUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Full Page View
                </a>
              </Button>
            )}
            {!bookmark.thumbnailUrl &&
              !bookmark.screenshotMobileUrl &&
              !bookmark.screenshotFullPageUrl && (
                <p className="text-sm text-muted-foreground">
                  No screenshots available yet.
                </p>
              )}
          </div>
        </div>

        {/* Content */}
        <div>
          <Label>Content</Label>
          <div className="space-y-2 mt-1">
            {bookmark.pdfUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                asChild
              >
                <a
                  href={normalizeApiUrl(bookmark.pdfUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="mr-2 h-4 w-4" />
                  PDF Version
                </a>
              </Button>
            )}
            {bookmark.contentUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                asChild
              >
                <a
                  href={normalizeApiUrl(bookmark.contentUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Extracted Markdown
                </a>
              </Button>
            )}
            {bookmark.readableUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                asChild
              >
                <a
                  href={normalizeApiUrl(bookmark.readableUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Readable Version
                </a>
              </Button>
            )}
            {bookmark.readmeUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                asChild
              >
                <a
                  href={normalizeApiUrl(bookmark.readmeUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  README.md
                </a>
              </Button>
            )}
            {!bookmark.pdfUrl &&
              !bookmark.contentUrl &&
              !bookmark.readableUrl &&
              !bookmark.readmeUrl && (
                <p className="text-sm text-muted-foreground">
                  No content available yet.
                </p>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
