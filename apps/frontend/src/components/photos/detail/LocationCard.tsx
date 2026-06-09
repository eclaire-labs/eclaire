import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { Photo } from "@/types/photo";

// Helper function to safely format coordinates
const formatCoordinate = (
  coord: number | string | null | undefined,
): string | null => {
  if (coord === null || coord === undefined) return null;

  // Convert to number if it's a string
  const numCoord = typeof coord === "string" ? parseFloat(coord) : coord;

  // Check if it's a valid number
  if (typeof numCoord === "number" && !Number.isNaN(numCoord)) {
    return numCoord.toFixed(6);
  }

  // Return the original value as string if it can't be converted
  return String(coord);
};

interface LocationCardProps {
  photo: Photo;
}

/** Sidebar card showing photo location (place name and GPS coordinates). */
export function LocationCard({ photo }: LocationCardProps) {
  if (!(photo.latitude || photo.locationCity)) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Location</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {photo.locationCity && (
          <div className="flex items-center space-x-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Location</Label>
              <p className="text-sm text-muted-foreground">
                {photo.locationCity}
                {photo.locationCountryName && `, ${photo.locationCountryName}`}
              </p>
            </div>
          </div>
        )}

        {photo.latitude && photo.longitude && (
          <div>
            <Label className="text-sm font-medium">Coordinates</Label>
            <p className="text-sm text-muted-foreground">
              {formatCoordinate(photo.latitude)},{" "}
              {formatCoordinate(photo.longitude)}
            </p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <a
                href={`https://maps.google.com/?q=${formatCoordinate(photo.latitude)},${formatCoordinate(photo.longitude)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin className="h-4 w-4 mr-2" />
                View on Map
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
