"use client";

import { MobileListsBackButton } from "@/components/mobile/mobile-lists-back-button";
import { FileUpload } from "@/components/upload/file-upload";
import { useIsMobile } from "@/hooks/use-mobile";

export default function UploadPage() {
  const isMobile = useIsMobile();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <MobileListsBackButton />
        <div>
          <h1 className="text-lg md:text-3xl font-bold md:tracking-tight">
            Upload Files
          </h1>
          {!isMobile && (
            <p className="text-muted-foreground">
              Drag & drop, browse, or paste your files and folders
            </p>
          )}
        </div>
      </div>
      <FileUpload />
    </div>
  );
}
