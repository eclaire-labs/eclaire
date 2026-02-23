import {
  Archive,
  CheckCircle,
  Clock,
  Cloud,
  File,
  FileText,
  Folder,
  Image,
  Music,
  Upload as UploadIcon,
  Video,
  XCircle,
} from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/frontend-api";
import { cn } from "@/lib/utils";

interface FileItem {
  file: File;
  status: "pending" | "uploading" | "success" | "error";
  id: string;
  relativePath?: string;
}

export function FileUpload() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [pasteIndicatorVisible, setPasteIndicatorVisible] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadAreaRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <Image className="h-4 w-4" />;
    if (mimeType.startsWith("video/")) return <Video className="h-4 w-4" />;
    if (mimeType.startsWith("audio/")) return <Music className="h-4 w-4" />;
    if (mimeType.includes("pdf")) return <FileText className="h-4 w-4" />;
    if (mimeType.includes("zip") || mimeType.includes("archive"))
      return <Archive className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  const generateFileId = () =>
    `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const addFiles = useCallback(
    (newFiles: File[], basePath = "") => {
      const fileItems: FileItem[] = newFiles.map((file) => ({
        file,
        status: "pending" as const,
        id: generateFileId(),
        relativePath: basePath ? `${basePath}/${file.name}` : file.name,
      }));

      setFiles((prev) => [...prev, ...fileItems]);
    },
    [generateFileId],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploadAreaRef.current?.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
        toast({
          title: "Files Added",
          description: `Added ${droppedFiles.length} file(s) for upload`,
        });
      }
    },
    [addFiles, toast],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      addFiles(selectedFiles);
      e.target.value = "";
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      e.preventDefault();

      setPasteIndicatorVisible(true);
      setTimeout(() => setPasteIndicatorVisible(false), 2000);

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const items = Array.from(clipboardData.items);
      const pastedFiles: File[] = [];

      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            pastedFiles.push(file);
          }
        }
      }

      if (pastedFiles.length > 0) {
        addFiles(pastedFiles, "pasted");
      }
    },
    [addFiles],
  );

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    let uploadedCount = 0;
    const pendingFiles = files.filter((item) => item.status === "pending");

    for (const fileItem of pendingFiles) {
      setFiles((prev) =>
        prev.map((item) =>
          item.id === fileItem.id ? { ...item, status: "uploading" } : item,
        ),
      );

      try {
        await uploadSingleFile(fileItem.file, fileItem.relativePath);

        setFiles((prev) =>
          prev.map((item) =>
            item.id === fileItem.id ? { ...item, status: "success" } : item,
          ),
        );

        uploadedCount++;
      } catch (error) {
        console.error("Upload failed for file:", fileItem.file.name, error);

        setFiles((prev) =>
          prev.map((item) =>
            item.id === fileItem.id ? { ...item, status: "error" } : item,
          ),
        );

        toast({
          title: "Upload Failed",
          description: `Failed to upload ${fileItem.file.name}`,
          variant: "destructive",
        });
      }

      setUploadProgress((uploadedCount / pendingFiles.length) * 100);
    }

    setUploading(false);
    toast({
      title: "Upload Complete",
      description: `Successfully uploaded ${uploadedCount} files`,
    });
  };

  const uploadSingleFile = async (
    file: File,
    relativePath?: string,
  ): Promise<void> => {
    const formData = new FormData();
    formData.append("content", file);

    // Create metadata object with file properties
    const metadata = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      relativePath: relativePath || file.name,
      webkitRelativePath: (file as any).webkitRelativePath || "",
      uploadTimestamp: new Date().toISOString(),
      fileExtension: file.name.split(".").pop()?.toLowerCase() || "",
      baseName: file.name.substring(0, file.name.lastIndexOf(".")) || file.name,
      isDirectory: file.type === "" && file.size === 0,
      isPastedContent: relativePath?.startsWith("pasted") || false,
      contentSource: relativePath?.startsWith("pasted")
        ? "clipboard"
        : "file-system",
    };

    formData.append("metadata", JSON.stringify(metadata));

    const response = await apiFetch("/api/all", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  };

  // Set up paste event listener and prevent default drag/drop on document
  React.useEffect(() => {
    const handleDocumentDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = "copy";
    };

    const handleDocumentDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDocumentDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Only handle files if they're dropped outside the upload area
      if (!uploadAreaRef.current?.contains(e.target as Node)) {
        const droppedFiles = Array.from(e.dataTransfer?.files || []);
        if (droppedFiles.length > 0) {
          addFiles(droppedFiles);
          toast({
            title: "Files Added",
            description: `Added ${droppedFiles.length} file(s) for upload`,
          });
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    document.addEventListener("dragover", handleDocumentDragOver);
    document.addEventListener("dragenter", handleDocumentDragEnter);
    document.addEventListener("drop", handleDocumentDrop);

    return () => {
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("dragover", handleDocumentDragOver);
      document.removeEventListener("dragenter", handleDocumentDragEnter);
      document.removeEventListener("drop", handleDocumentDrop);
    };
  }, [handlePaste, addFiles, toast]);

  const totalSize = files.reduce((sum, item) => sum + item.file.size, 0);
  const successCount = files.filter((item) => item.status === "success").length;
  const pendingCount = files.filter((item) => item.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Paste Indicator */}
      {pasteIndicatorVisible && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 fade-in-0 duration-300">
          <Card className="border-primary">
            <CardContent className="flex items-center gap-2 p-3">
              <Cloud className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                Pasted content detected! Processing...
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Area */}
      <Card>
        <CardContent className="p-0">
          <div
            ref={uploadAreaRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300",
              dragOver
                ? "border-primary bg-primary/5 scale-[1.02]"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
            )}
          >
            <Cloud className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">
              Drop your files and folders here
            </h3>
            <p className="text-muted-foreground mb-6">
              or use the buttons below, or press Ctrl+V to paste
            </p>

            <div className="flex flex-wrap gap-3 justify-center">
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="default"
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                Browse Files
              </Button>
              <Button
                onClick={() => folderInputRef.current?.click()}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Folder className="h-4 w-4" />
                Browse Folders
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hidden Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: "" } as any)}
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Upload Summary */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Upload Summary</span>
              <Button
                onClick={uploadFiles}
                disabled={uploading || pendingCount === 0}
                className="flex items-center gap-2"
              >
                <UploadIcon className="h-4 w-4" />
                {uploading ? "Uploading..." : `Upload ${pendingCount} Files`}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Upload Progress</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {files.length}
                </div>
                <div className="text-sm text-muted-foreground">Total Files</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {formatFileSize(totalSize)}
                </div>
                <div className="text-sm text-muted-foreground">Total Size</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {successCount}
                </div>
                <div className="text-sm text-muted-foreground">Uploaded</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {files.map((fileItem) => (
                <div
                  key={fileItem.id}
                  className="flex items-center justify-between p-3 rounded-lg border-l-4 border-l-primary bg-muted/30"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getFileIcon(fileItem.file.type)}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate">
                        {fileItem.relativePath || fileItem.file.name}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {formatFileSize(fileItem.file.size)} • Modified:{" "}
                        {new Date(fileItem.file.lastModified).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex-shrink-0 ml-3">
                    {fileItem.status === "pending" && (
                      <Badge variant="secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                    {fileItem.status === "uploading" && (
                      <Badge variant="default">
                        <UploadIcon className="h-3 w-3 mr-1" />
                        Uploading
                      </Badge>
                    )}
                    {fileItem.status === "success" && (
                      <Badge
                        variant="default"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Success
                      </Badge>
                    )}
                    {fileItem.status === "error" && (
                      <Badge variant="destructive">
                        <XCircle className="h-3 w-3 mr-1" />
                        Failed
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
