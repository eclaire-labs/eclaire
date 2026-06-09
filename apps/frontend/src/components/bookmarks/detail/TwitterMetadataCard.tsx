import {
  Clock,
  Eye,
  Heart,
  MessageCircle,
  Repeat,
  Shield,
  User,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/date-utils";
import type { Bookmark, TwitterMetadata } from "@/types/bookmark";

import { formatCount } from "./format-count";

const isTwitterBookmark = (
  bookmark: Bookmark,
): bookmark is Bookmark & {
  rawMetadata: { twitter: TwitterMetadata };
} => {
  return !!(
    bookmark.rawMetadata?.twitter &&
    (bookmark.url.toLowerCase().includes("twitter.com") ||
      bookmark.url.toLowerCase().includes("x.com"))
  );
};

/** Twitter/X tweet metadata sidebar card. Renders nothing for non-Twitter bookmarks. */
export function TwitterMetadataCard({ bookmark }: { bookmark: Bookmark }) {
  if (!isTwitterBookmark(bookmark)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Tweet Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Author Information */}
        <div>
          <Label>Author</Label>
          <div className="flex items-center gap-3 mt-1">
            {bookmark.rawMetadata.twitter.author_profile_image ? (
              <img
                src={bookmark.rawMetadata.twitter.author_profile_image}
                alt={bookmark.rawMetadata.twitter.author_name}
                className="h-8 w-8 rounded-full"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center"
              style={{
                display: bookmark.rawMetadata.twitter.author_profile_image
                  ? "none"
                  : "flex",
              }}
            >
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span className="font-medium text-sm">
                  {bookmark.rawMetadata.twitter.author_name}
                </span>
                {bookmark.rawMetadata.twitter.author_verified_type && (
                  <Shield className="h-3 w-3 text-blue-500" />
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                @{bookmark.rawMetadata.twitter.author_username}
              </span>
            </div>
          </div>
        </div>

        {/* Tweet Type and Content Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Tweet Type</Label>
            <div className="mt-1">
              <Badge variant="outline" className="capitalize">
                {bookmark.rawMetadata.twitter.tweet_type}
              </Badge>
            </div>
          </div>
          <div>
            <Label>Age Category</Label>
            <div className="mt-1">
              <Badge
                variant={
                  bookmark.rawMetadata.twitter.age_category === "older"
                    ? "default"
                    : bookmark.rawMetadata.twitter.age_category === "fresh"
                      ? "secondary"
                      : "outline"
                }
                className="capitalize"
              >
                {bookmark.rawMetadata.twitter.age_category}
              </Badge>
            </div>
          </div>
        </div>

        {/* Engagement Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Likes
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.twitter.likes)}
            </p>
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Retweets
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.twitter.retweets)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Replies
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.twitter.replies)}
            </p>
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Impressions
            </Label>
            <p className="text-sm text-muted-foreground mt-1">
              {bookmark.rawMetadata.twitter.impressions > 0
                ? formatCount(bookmark.rawMetadata.twitter.impressions)
                : "N/A"}
            </p>
          </div>
        </div>

        {/* Quotes */}
        {bookmark.rawMetadata.twitter.quotes > 0 && (
          <div>
            <Label className="flex items-center gap-2">Quotes</Label>
            <p className="text-sm text-muted-foreground mt-1">
              {formatCount(bookmark.rawMetadata.twitter.quotes)}
            </p>
          </div>
        )}

        {/* Media and Links */}
        {(bookmark.rawMetadata.twitter.has_media ||
          bookmark.rawMetadata.twitter.has_links) && (
          <div className="grid grid-cols-2 gap-4">
            {bookmark.rawMetadata.twitter.has_media && (
              <div>
                <Label>Media</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {bookmark.rawMetadata.twitter.media_count} media item(s)
                </p>
              </div>
            )}
            {bookmark.rawMetadata.twitter.has_links && (
              <div>
                <Label>Links</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {bookmark.rawMetadata.twitter.link_count} external link(s)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Content Stats */}
        <div>
          <Label>Content Length</Label>
          <p className="text-sm text-muted-foreground mt-1">
            {bookmark.rawMetadata.twitter.text_length} characters
          </p>
        </div>

        {/* Posted Date */}
        <div>
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Posted
          </Label>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDate(bookmark.rawMetadata.twitter.created_at)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
