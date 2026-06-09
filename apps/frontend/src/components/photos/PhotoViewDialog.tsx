import {
  formatDimensions,
  formatExposureTime,
  formatFileSize,
  formatFNumber,
  formatLocation,
} from "@/components/pages/photos/photo-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/list-page-utils";
import type { Photo } from "@/types/photo";

interface PhotoViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photo: Photo | null;
  onDelete: (photo: Photo) => void;
  onEdit: (photo: Photo) => void;
}

/** Read-only photo details dialog: basic info, EXIF, location, timestamps. */
export function PhotoViewDialog({
  open,
  onOpenChange,
  photo,
  onDelete,
  onEdit,
}: PhotoViewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">
            {photo?.title ?? "Photo Details"}
          </DialogTitle>
          <DialogDescription>
            Taken on{" "}
            {photo ? formatDate(photo.dateTaken ?? photo.createdAt) : "N/A"}
          </DialogDescription>
        </DialogHeader>
        {photo && (
          <div className="grid md:grid-cols-3 gap-6 py-4 max-h-[75vh] overflow-y-auto pr-2">
            <div className="md:col-span-2 aspect-video overflow-hidden rounded-md bg-muted flex items-center justify-center">
              <img
                src={photo.thumbnailUrl || "/placeholder.svg"}
                alt={photo.title}
                className="object-contain max-w-full max-h-[70vh]"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  const retryCount = parseInt(
                    img.dataset.retryCount || "0",
                    10,
                  );
                  if (retryCount < 1) {
                    img.dataset.retryCount = String(retryCount + 1);
                    img.src = "/placeholder.svg";
                  }
                }}
              />
            </div>
            <div className="space-y-4 text-sm md:col-span-1">
              {/* Basic Info */}
              <h3 className="font-semibold mb-2 border-b pb-1 text-base">
                Information
              </h3>
              <div className="space-y-2.5">
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Description
                  </Label>
                  <p className="mt-0.5">
                    {photo.description || (
                      <span className="italic text-muted-foreground">
                        No description.
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Tags
                  </Label>
                  {photo.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {photo.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="font-normal"
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-0.5 italic text-muted-foreground">
                      No tags.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Filename
                  </Label>
                  <p className="mt-0.5 truncate">{photo.originalFilename}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    File Size / Type
                  </Label>
                  <p className="mt-0.5">
                    {formatFileSize(photo.fileSize)} ({photo.mimeType})
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Dimensions
                  </Label>
                  <p className="mt-0.5">
                    {formatDimensions(photo.imageWidth, photo.imageHeight)}
                  </p>
                </div>
              </div>

              {/* EXIF Details */}
              <h3 className="font-semibold mb-2 border-b pb-1 pt-3 text-base">
                Camera Details
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Camera
                  </Label>
                  <p className="mt-0.5">
                    {photo.cameraMake || photo.cameraModel ? (
                      `${photo.cameraMake || ""} ${photo.cameraModel || ""}`.trim()
                    ) : (
                      <span className="italic text-muted-foreground">N/A</span>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Lens
                  </Label>
                  <p className="mt-0.5">
                    {photo.lensModel || (
                      <span className="italic text-muted-foreground">N/A</span>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Aperture
                  </Label>
                  <p className="mt-0.5">
                    {photo.fNumber ? (
                      formatFNumber(photo.fNumber)
                    ) : (
                      <span className="italic text-muted-foreground">N/A</span>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Shutter Speed
                  </Label>
                  <p className="mt-0.5">
                    {photo.exposureTime ? (
                      formatExposureTime(photo.exposureTime)
                    ) : (
                      <span className="italic text-muted-foreground">N/A</span>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    ISO
                  </Label>
                  <p className="mt-0.5">
                    {photo.iso ?? (
                      <span className="italic text-muted-foreground">N/A</span>
                    )}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Device ID
                  </Label>
                  <p className="mt-0.5">
                    {photo.deviceId || (
                      <span className="italic text-muted-foreground">N/A</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Location Details */}
              <h3 className="font-semibold mb-2 border-b pb-1 pt-3 text-base">
                Location
              </h3>
              <div className="space-y-2.5">
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Place
                  </Label>
                  <p className="mt-0.5">
                    {formatLocation(
                      photo.locationCity,
                      photo.locationCountryName,
                    ) ?? (
                      <span className="italic text-muted-foreground">
                        No location data
                      </span>
                    )}
                  </p>
                </div>
                {photo.latitude && photo.longitude && (
                  <div>
                    <Label className="text-xs text-muted-foreground font-medium">
                      Coordinates
                    </Label>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${photo.latitude},${photo.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                    >
                      <span>
                        {photo.latitude.toFixed(5)},{" "}
                        {photo.longitude.toFixed(5)}
                      </span>
                    </a>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <h3 className="font-semibold mb-2 border-b pb-1 pt-3 text-base">
                Timestamps
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Date Taken
                  </Label>
                  <p className="mt-0.5">{formatDate(photo.dateTaken)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Date Uploaded
                  </Label>
                  <p className="mt-0.5">{formatDate(photo.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground font-medium">
                    Last Updated
                  </Label>
                  <p className="mt-0.5">{formatDate(photo.updatedAt)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter className="sm:justify-between gap-2 pt-4 border-t mt-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              onOpenChange(false);
              if (photo) onDelete(photo);
            }}
          >
            Delete
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Close
              </Button>
            </DialogClose>
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                if (photo) onEdit(photo);
              }}
            >
              Edit Metadata
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
