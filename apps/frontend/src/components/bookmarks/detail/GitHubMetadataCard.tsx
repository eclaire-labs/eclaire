import {
  Clock,
  Code,
  ExternalLink,
  GitFork,
  Package,
  Star,
  Tag,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/date-utils";
import type { Bookmark, GitHubMetadata } from "@/types/bookmark";

import { formatCount } from "./format-count";

const isGitHubRepository = (
  bookmark: Bookmark,
): bookmark is Bookmark & {
  rawMetadata: { github: GitHubMetadata };
} => {
  return !!(
    bookmark.rawMetadata?.github &&
    bookmark.url.toLowerCase().includes("github.com")
  );
};

/** GitHub repository metadata sidebar card. Renders nothing for non-GitHub bookmarks. */
export function GitHubMetadataCard({ bookmark }: { bookmark: Bookmark }) {
  if (!isGitHubRepository(bookmark)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          GitHub Repository
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Repository Name */}
        <div>
          <Label>Repository</Label>
          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              asChild
            >
              <a
                href={bookmark.rawMetadata.github.repositoryData.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                {bookmark.rawMetadata.github.owner}/
                {bookmark.rawMetadata.github.repo}
                <ExternalLink className="h-3 w-3 ml-auto" />
              </a>
            </Button>
          </div>
        </div>

        {/* Stars and Forks */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Stars
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.github.stars)}
            </p>
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <GitFork className="h-4 w-4" />
              Forks
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.github.forks)}
            </p>
          </div>
        </div>

        {/* Language */}
        {bookmark.rawMetadata.github.language && (
          <div>
            <Label className="flex items-center gap-2">
              <Code className="h-4 w-4" />
              Language
            </Label>
            <Badge variant="outline" className="mt-1">
              {bookmark.rawMetadata.github.language}
            </Badge>
          </div>
        )}

        {/* Topics */}
        {bookmark.rawMetadata.github.topics &&
          bookmark.rawMetadata.github.topics.length > 0 && (
            <div>
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Topics
              </Label>
              <div className="flex flex-wrap gap-1 mt-1">
                {bookmark.rawMetadata.github.topics
                  .slice(0, 6)
                  .map((topic: string) => (
                    <Badge key={topic} variant="secondary" className="text-xs">
                      {topic}
                    </Badge>
                  ))}
                {bookmark.rawMetadata.github.topics.length > 6 && (
                  <Badge variant="secondary" className="text-xs">
                    +{bookmark.rawMetadata.github.topics.length - 6} more
                  </Badge>
                )}
              </div>
            </div>
          )}

        {/* Latest Release */}
        {bookmark.rawMetadata.github.latestRelease && (
          <div>
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Latest Release
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {bookmark.rawMetadata.github.latestRelease.version} -{" "}
              {formatDate(bookmark.rawMetadata.github.latestRelease.date)}
            </p>
          </div>
        )}

        {/* Last Commit */}
        {bookmark.rawMetadata.github.lastCommitDate && (
          <div>
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last Commit
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDate(bookmark.rawMetadata.github.lastCommitDate)}
            </p>
          </div>
        )}

        {/* License */}
        {bookmark.rawMetadata.github.license && (
          <div>
            <Label>License</Label>
            <p className="text-sm text-muted-foreground mt-1">
              {bookmark.rawMetadata.github.license}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
