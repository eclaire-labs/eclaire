import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Image as ImageIcon,
  Trash2,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Photo } from "@/types/photo";

interface PhotoGalleryViewProps {
  photos: Photo[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (direction: "next" | "prev") => void;
  onNavigateToIndex: (index: number) => void;
  onEdit: (photo: Photo) => void;
  onDelete: (photo: Photo) => void;
}

export function PhotoGalleryView({
  photos,
  currentIndex,
  onClose,
  onNavigate,
  onEdit,
  onDelete,
  onNavigateToIndex,
}: PhotoGalleryViewProps) {
  // Touch/swipe navigation state (must be before early return per Rules of Hooks)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(
    null,
  );

  const currentPhoto = photos[currentIndex];

  // Gallery-specific keyboard navigation
  const handleGalleryKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!currentPhoto) return;

      switch (event.key) {
        case "ArrowRight":
        case " ":
          event.preventDefault();
          onNavigate("next");
          break;
        case "ArrowLeft":
          event.preventDefault();
          onNavigate("prev");
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "Enter":
          event.preventDefault();
          onEdit(currentPhoto);
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          onDelete(currentPhoto);
          break;
      }
    },
    [currentPhoto, onNavigate, onClose, onEdit, onDelete],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleGalleryKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGalleryKeyDown);
    };
  }, [handleGalleryKeyDown]);

  if (!currentPhoto) return null;

  // Prefer full image, fall back to thumbnail
  const imgSrc = currentPhoto.imageUrl || currentPhoto.thumbnailUrl;

  // Handle touch events for swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchEnd(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const deltaX = touchStart.x - touchEnd.x;
    const deltaY = touchStart.y - touchEnd.y;

    // Only trigger swipe if horizontal movement is greater than vertical
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      const minSwipeDistance = 50;

      if (deltaX > minSwipeDistance) {
        onNavigate("next");
      } else if (deltaX < -minSwipeDistance) {
        onNavigate("prev");
      }
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  // Simple thumbnail strip logic
  const getThumbIndices = () => {
    const total = photos.length;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);
    const start = Math.max(0, currentIndex - 3);
    const end = Math.min(total, start + 7);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    while (indices.length < 7 && (indices[0] ?? 0) > 0) {
      indices.unshift((indices[0] ?? 0) - 1);
    }
    return indices;
  };
  const thumbIndices = getThumbIndices();

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close overlay, keyboard navigation handled by useEffect
    <div
      role="presentation"
      className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Close Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 md:top-4 md:right-4 text-white hover:bg-white/20 hover:text-white z-50 h-10 w-10 md:h-12 md:w-12"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="h-5 w-5 md:h-6 md:w-6" />
      </Button>

      {/* Action Buttons (Edit/Delete) */}
      <div className="absolute top-2 left-2 md:top-4 md:left-4 flex gap-1 md:gap-2 z-50">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20 hover:text-white h-10 w-10 md:h-12 md:w-12"
          title="Edit Metadata (Enter)"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(currentPhoto);
          }}
        >
          <Edit className="h-4 w-4 md:h-5 md:w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-red-500/50 hover:text-white h-10 w-10 md:h-12 md:w-12"
          title="Delete Photo (Delete/Backspace)"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(currentPhoto);
          }}
        >
          <Trash2 className="h-4 w-4 md:h-5 md:w-5" />
        </Button>
      </div>

      {/* Main Image Area */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click handler only stops propagation to backdrop */}
      <div
        role="presentation"
        className="relative flex-1 flex items-center justify-center w-full max-h-[calc(100vh-120px)] md:max-h-[calc(100vh-150px)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-1 md:left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 hover:text-white h-10 w-10 md:h-12 md:w-12 rounded-full z-10"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("prev");
          }}
          title="Previous (Left Arrow)"
        >
          <ChevronLeft className="h-6 w-6 md:h-8 md:w-8" />
        </Button>

        {imgSrc ? (
          <img
            src={imgSrc}
            alt={currentPhoto.title}
            className="max-w-full max-h-full object-contain block"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/placeholder.svg";
            }}
          />
        ) : (
          <div className="w-64 h-64 flex items-center justify-center bg-muted/20 rounded-lg">
            <ImageIcon className="w-24 h-24 text-muted-foreground" />
          </div>
        )}

        {/* Next Button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-1 md:right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 hover:text-white h-10 w-10 md:h-12 md:w-12 rounded-full z-10"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate("next");
          }}
          title="Next (Right Arrow or Space)"
        >
          <ChevronRight className="h-6 w-6 md:h-8 md:w-8" />
        </Button>
      </div>

      {/* Info Overlay & Thumbnail Strip */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: click handler only stops propagation to backdrop */}
      <div
        role="presentation"
        className="w-full max-w-4xl mt-2 md:mt-4 text-center text-white/80 px-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base md:text-lg font-medium truncate mb-1">
          {currentPhoto.title}
        </p>
        <p className="text-sm mb-2 md:mb-3">
          {currentIndex + 1} of {photos.length}
        </p>

        {/* Thumbnail Strip */}
        {photos.length > 1 && (
          <div className="flex justify-center gap-1 md:gap-2 overflow-x-auto pb-2 md:pb-4">
            {thumbIndices.map((idx) => {
              const thumbPhoto = photos[idx];
              if (!thumbPhoto) return null;
              return (
                // biome-ignore lint/a11y/useSemanticElements: thumbnail with image content not suited for button element
                <div
                  key={thumbPhoto.id}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                  role="button"
                  tabIndex={0}
                  className={`w-12 h-12 md:w-16 md:h-16 rounded overflow-hidden cursor-pointer flex-shrink-0 bg-black/50 touch-manipulation ${idx === currentIndex ? "ring-2 ring-white" : "opacity-60 hover:opacity-100"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToIndex(idx);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onNavigateToIndex(idx);
                    }
                  }}
                >
                  {thumbPhoto.thumbnailUrl ? (
                    <img
                      src={thumbPhoto.thumbnailUrl}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
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
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
