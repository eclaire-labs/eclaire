import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PhotoFullscreenViewProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Fullscreen overlay showing the photo at full size; click outside to close. */
export function PhotoFullscreenView({
  src,
  alt,
  onClose,
}: PhotoFullscreenViewProps) {
  return (
    <div
      role="presentation"
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-4 right-4 z-10 text-white hover:bg-white/20 hover:text-white"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </Button>
      <img
        role="presentation"
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
