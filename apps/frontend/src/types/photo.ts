// src/types/photo.ts (or src/types/index.ts)

export interface Photo {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string; // Points to /api/photos/[id]/view (smart serving)
  thumbnailUrl: string | null; // Points to /api/photos/[id]/thumbnail
  originalUrl: string; // Points to /api/photos/[id]/original (direct access to original file)
  convertedJpgUrl: string | null; // Points to /api/photos/[id]/converted (when available)

  originalFilename: string;
  mimeType: string; // Original MIME type of the uploaded file
  fileSize: number;

  createdAt: string; // ISO String from API
  updatedAt: string; // ISO String from API
  dueDate: string | null; // ISO String or null from API
  dateTaken: string | null; // ISO String or null from API

  deviceId: string | null;
  tags: string[];

  // Image dimensions - aligned with backend
  imageWidth: number | null;
  imageHeight: number | null;

  // EXIF Data - flattened structure to match backend
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  fNumber: number | null; // Aperture
  exposureTime: number | null; // Shutter speed in seconds
  orientation: number | null;

  // Location Data - aligned with backend
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  locationCity: string | null;
  locationCountryIso2: string | null;
  locationCountryName: string | null;

  // AI Generated Data
  photoType: string | null;
  ocrText: string | null;
  dominantColors: string[] | null; // Array of color names

  // Optional fields from backend service for client-side hints
  isOriginalViewable?: boolean;

  // Processing status
  processingStatus:
    | "pending"
    | "processing"
    | "completed"
    | "failed"
    | "retry_pending"
    | null;

  // Review, flagging, and pinning
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  enabled: boolean;
}

// You can also put EditPhotoState here if it's used elsewhere
export interface EditPhotoState {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  deviceId: string | null;
}

export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  photoId?: string;
}
