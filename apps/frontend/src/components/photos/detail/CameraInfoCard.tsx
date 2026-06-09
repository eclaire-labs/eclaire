import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { Photo } from "@/types/photo";

// Helper function to format camera settings
const formatExposureTime = (exposureTime: number | null) => {
  if (!exposureTime) return null;
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}s`;
};

const formatAperture = (fNumber: number | null) => {
  if (!fNumber) return null;
  return `f/${fNumber}`;
};

interface CameraInfoCardProps {
  photo: Photo;
}

/** Sidebar card showing camera make/model, lens, and exposure settings. */
export function CameraInfoCard({ photo }: CameraInfoCardProps) {
  if (
    !(
      photo.cameraMake ||
      photo.cameraModel ||
      photo.lensModel ||
      photo.iso ||
      photo.fNumber ||
      photo.exposureTime
    )
  ) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Camera & Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(photo.cameraMake || photo.cameraModel) && (
          <div>
            <Label className="text-sm font-medium">Camera</Label>
            <p className="text-sm text-muted-foreground">
              {`${photo.cameraMake || ""} ${photo.cameraModel || ""}`.trim()}
            </p>
          </div>
        )}

        {photo.lensModel && (
          <div>
            <Label className="text-sm font-medium">Lens</Label>
            <p className="text-sm text-muted-foreground">{photo.lensModel}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {photo.iso && (
            <div>
              <Label className="text-sm font-medium">ISO</Label>
              <p className="text-sm text-muted-foreground">{photo.iso}</p>
            </div>
          )}

          {photo.fNumber && (
            <div>
              <Label className="text-sm font-medium">Aperture</Label>
              <p className="text-sm text-muted-foreground">
                {formatAperture(photo.fNumber)}
              </p>
            </div>
          )}

          {photo.exposureTime && (
            <div>
              <Label className="text-sm font-medium">Shutter</Label>
              <p className="text-sm text-muted-foreground">
                {formatExposureTime(photo.exposureTime)}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
