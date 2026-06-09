import { ArrowUp, Clock, Eye, Link, MessageCircle, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/date-utils";
import type { Bookmark, RedditMetadata } from "@/types/bookmark";

import { formatCount } from "./format-count";

const isRedditBookmark = (
  bookmark: Bookmark,
): bookmark is Bookmark & {
  rawMetadata: { reddit: RedditMetadata };
} => {
  return !!(
    bookmark.rawMetadata?.reddit &&
    bookmark.url.toLowerCase().includes("reddit.com")
  );
};

/** Reddit post metadata sidebar card. Renders nothing for non-Reddit bookmarks. */
export function RedditMetadataCard({ bookmark }: { bookmark: Bookmark }) {
  if (!isRedditBookmark(bookmark)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Reddit Post Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Subreddit Information */}
        <div>
          <Label>Subreddit</Label>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  r/{bookmark.rawMetadata.reddit.subreddit_name}
                </span>
                {bookmark.rawMetadata.reddit.subreddit_subscribers && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {formatCount(
                      bookmark.rawMetadata.reddit.subreddit_subscribers,
                    )}{" "}
                    members
                  </div>
                )}
              </div>
              {bookmark.rawMetadata.reddit.subreddit_description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {bookmark.rawMetadata.reddit.subreddit_description.slice(
                    0,
                    100,
                  )}
                  {bookmark.rawMetadata.reddit.subreddit_description.length >
                  100
                    ? "..."
                    : ""}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Post Type and Age */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Post Type</Label>
            <div className="mt-1">
              <Badge variant="outline" className="capitalize">
                {bookmark.rawMetadata.reddit.post_type}
              </Badge>
            </div>
          </div>
          <div>
            <Label>Age Category</Label>
            <div className="mt-1">
              <Badge
                variant={
                  bookmark.rawMetadata.reddit.age_category === "fresh"
                    ? "default"
                    : bookmark.rawMetadata.reddit.age_category === "recent"
                      ? "secondary"
                      : "outline"
                }
                className="capitalize"
              >
                {bookmark.rawMetadata.reddit.age_category}
              </Badge>
            </div>
          </div>
        </div>

        {/* Engagement Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-2">
              <ArrowUp className="h-4 w-4" />
              Score
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.reddit.score)} points
            </p>
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Comments
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.reddit.num_comments)}
            </p>
          </div>
        </div>

        {/* Upvote Ratio */}
        <div>
          <Label>Upvote Ratio</Label>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {Math.round(bookmark.rawMetadata.reddit.upvote_ratio * 100)}%
              upvoted
            </p>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 transition-all duration-300"
                style={{
                  width: `${bookmark.rawMetadata.reddit.upvote_ratio * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* External Domain (for link posts) */}
        {bookmark.rawMetadata.reddit.external_domain && (
          <div>
            <Label className="flex items-center gap-2">
              <Link className="h-4 w-4" />
              External Link
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {bookmark.rawMetadata.reddit.external_domain}
            </p>
          </div>
        )}

        {/* Content Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Content Length</Label>
            <p className="text-sm text-muted-foreground mt-1">
              {bookmark.rawMetadata.reddit.text_length} characters
            </p>
          </div>
          {bookmark.rawMetadata.reddit.has_media && (
            <div>
              <Label>Media</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Contains media content
              </p>
            </div>
          )}
        </div>

        {/* View Count (if available) */}
        {bookmark.rawMetadata.reddit.view_count && (
          <div>
            <Label className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Views
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.reddit.view_count)}
            </p>
          </div>
        )}

        {/* Posted Date */}
        <div>
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Posted
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDate(bookmark.rawMetadata.reddit.created_utc)}
          </p>
        </div>

        {/* Edited Date (if available) */}
        {bookmark.rawMetadata.reddit.edited_utc && (
          <div>
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Last Edited
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatDate(bookmark.rawMetadata.reddit.edited_utc)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
