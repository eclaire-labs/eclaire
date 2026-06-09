import { Camera, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { normalizeApiUrl } from "@/lib/api-client";
import type { Photo } from "@/types/photo";

interface PhotoAssetsCardProps {
  photo: Photo;
}

/** Sidebar card listing downloadable files and formats for a photo. */
export function PhotoAssetsCard({ photo }: PhotoAssetsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Photo Assets</CardTitle>
        <CardDescription>
          Available files and formats for this photo
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" variant="outline" asChild>
            <a
              href={normalizeApiUrl(photo.originalUrl)}
              download={photo.originalFilename}
            >
              <Camera className="mr-2 h-4 w-4" />
              Original Photo
            </a>
          </Button>
          {photo.thumbnailUrl && (
            <Button size="sm" variant="outline" asChild>
              <a
                href={normalizeApiUrl(photo.thumbnailUrl)}
                download={`${photo.title || "photo"}-thumbnail.webp`}
              >
                <Camera className="mr-2 h-4 w-4" />
                Thumbnail
              </a>
            </Button>
          )}
          {photo.convertedJpgUrl && (
            <Button size="sm" variant="outline" asChild>
              <a
                href={normalizeApiUrl(photo.convertedJpgUrl)}
                download={`${photo.title || "photo"}.jpg`}
              >
                <Camera className="mr-2 h-4 w-4" />
                Converted JPG
              </a>
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <a
              href={normalizeApiUrl(`/api/photos/${photo.id}/analysis`)}
              download={`${photo.title || photo.id}-analysis.json`}
            >
              <Eye className="mr-2 h-4 w-4" />
              Analysis Report
            </a>
          </Button>
          {photo.processingStatus === "completed" && (
            <Button size="sm" variant="outline" asChild>
              <a
                href={normalizeApiUrl(`/api/photos/${photo.id}/content`)}
                download={`${photo.title || photo.id}-content.md`}
              >
                <Eye className="mr-2 h-4 w-4" />
                Content
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
