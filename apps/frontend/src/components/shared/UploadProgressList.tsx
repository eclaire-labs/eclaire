import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

interface UploadProgressListProps {
  uploads: UploadingFile[];
  onClearComplete: () => void;
  formatFileSize?: (bytes: number) => string;
}

const defaultFormatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
};

export function UploadProgressList({
  uploads,
  onClearComplete,
  formatFileSize = defaultFormatFileSize,
}: UploadProgressListProps) {
  const completedCount = uploads.filter(
    (u) => u.status === "success" || u.status === "error",
  ).length;

  return (
    <Card className="mb-4 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base font-semibold">Uploads</CardTitle>
          {completedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={onClearComplete}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear Completed
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3 max-h-60 overflow-y-auto">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className={`flex items-center gap-3 p-2 rounded-md transition-opacity ${
              upload.status === "success" || upload.status === "error"
                ? "opacity-70"
                : ""
            }`}
          >
            <div className="flex-shrink-0">
              {upload.status === "pending" && (
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              )}
              {upload.status === "uploading" && (
                <UploadCloud className="h-4 w-4 text-blue-500 animate-pulse" />
              )}
              {upload.status === "success" && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {upload.status === "error" && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-medium truncate"
                title={upload.file.name}
              >
                {upload.file.name}
              </p>
              {(upload.status === "pending" ||
                upload.status === "uploading") && (
                <Progress value={upload.progress} className="h-1 mt-1" />
              )}
              {upload.status === "error" && (
                <p
                  className="text-xs text-red-600 truncate"
                  title={upload.error}
                >
                  {upload.error}
                </p>
              )}
              {upload.status === "success" && (
                <p className="text-xs text-green-600">Upload complete</p>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatFileSize(upload.file.size)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
