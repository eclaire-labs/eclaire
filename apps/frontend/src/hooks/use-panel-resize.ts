/**
 * Drag-to-resize state for a right-docked panel (e.g. the assistant panel).
 * Tracks the panel width and wires document-level mouse listeners while a
 * drag is in progress.
 */

import { useCallback, useEffect, useState } from "react";

interface UsePanelResizeOptions {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Selector for the container whose right edge anchors the panel. */
  containerSelector?: string;
}

export function usePanelResize({
  initialWidth = 384, // 96 * 4 = 384px (w-96 equivalent)
  minWidth = 280,
  maxWidth = 800,
  containerSelector = ".main-layout-container",
}: UsePanelResizeOptions = {}) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const containerRect = document
        .querySelector(containerSelector)
        ?.getBoundingClientRect();
      if (!containerRect) return;

      // Calculate new width from the right edge of the container
      const newWidth = containerRect.right - e.clientX;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      setWidth(constrainedWidth);
    },
    [isResizing, containerSelector, minWidth, maxWidth],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      // Prevent text selection while resizing
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return { width, setWidth, isResizing, handleMouseDown };
}
