/**
 * Shared action handlers for detail pages.
 *
 * Encapsulates pin/flag toggling, reprocess, delete, and chat actions that
 * are duplicated across all 5 entity detail pages.
 */

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { setFlagColor, togglePin } from "@/lib/api-content";
import { isJobStuck } from "@/lib/date-utils";

export type ContentType =
  | "notes"
  | "bookmarks"
  | "documents"
  | "photos"
  | "tasks";

type FlagColor = "red" | "yellow" | "orange" | "green" | "blue" | null;

interface DetailItem {
  id: string;
  title: string | null;
  isPinned: boolean;
  flagColor: string | null;
  processingStatus: string | null;
  createdAt: string;
  updatedAt: string;
  processingEnabled?: boolean;
}

interface UseDetailPageActionsOptions {
  contentType: ContentType;
  item: DetailItem | undefined;
  refresh: () => void;
  onDeleted: () => void;
  /** Extra work to do after reprocess succeeds (e.g. invalidate analysis cache). */
  onReprocessed?: () => void;
}

export function useDetailPageActions(options: UseDetailPageActionsOptions) {
  const { contentType, item, refresh, onDeleted, onReprocessed } = options;
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [showReprocessDialog, setShowReprocessDialog] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const singular = contentType.replace(/s$/, "");
  const label = singular.charAt(0).toUpperCase() + singular.slice(1);

  // ── Pin ──────────────────────────────────────────────────────────────

  const handlePinToggle = async () => {
    if (!item) return;
    try {
      const response = await togglePin(contentType, item.id, !item.isPinned);
      if (response.ok) {
        refresh();
        toast.success(item.isPinned ? "Unpinned" : "Pinned", {
          description: `${label} has been ${item.isPinned ? "unpinned" : "pinned"}.`,
        });
      } else {
        toast.error("Error", {
          description: "Failed to update pin status",
        });
      }
    } catch {
      toast.error("Error", {
        description: "Failed to update pin status",
      });
    }
  };

  // ── Flag ─────────────────────────────────────────────────────────────

  const handleFlagColorChange = async (color: FlagColor) => {
    if (!item) return;
    try {
      const response = await setFlagColor(contentType, item.id, color);
      if (response.ok) {
        refresh();
        toast.success(color ? "Flag Updated" : "Flag Removed", {
          description: color
            ? `${label} flag changed to ${color}.`
            : `Flag removed from ${singular}.`,
        });
      } else {
        toast.error("Error", {
          description: "Failed to update flag color",
        });
      }
    } catch {
      toast.error("Error", {
        description: "Failed to update flag color",
      });
    }
  };

  const handleFlagToggle = async () => {
    if (!item) return;
    await handleFlagColorChange(item.flagColor ? null : "orange");
  };

  // ── Chat ─────────────────────────────────────────────────────────────

  const handleChatClick = () => {
    if (!item) return;
    if (
      typeof window !== "undefined" &&
      // biome-ignore lint/suspicious/noExplicitAny: global window extension for assistant
      (window as any).openAssistantWithAssets
    ) {
      // biome-ignore lint/suspicious/noExplicitAny: global window extension for assistant
      (window as any).openAssistantWithAssets([
        { type: singular, id: item.id, title: item.title },
      ]);
    }
  };

  // ── Reprocess ────────────────────────────────────────────────────────

  const handleReprocess = async () => {
    if (!item) return;
    try {
      setIsReprocessing(true);
      setShowReprocessDialog(false);

      const stuck = isJobStuck(item);
      const response = await apiFetch(
        `/api/${contentType}/${item.id}/reprocess`,
        {
          method: "POST",
          ...(stuck && { body: JSON.stringify({ force: true }) }),
        },
      );

      if (response.ok) {
        toast.success("Reprocessing Started", {
          description: `Your ${singular} has been queued for reprocessing. This may take a few minutes.`,
        });
        onReprocessed?.();
      } else {
        const errorData = await response.json();
        toast.error("Error", {
          description: errorData.error || `Failed to reprocess ${singular}`,
        });
      }
    } catch {
      toast.error("Error", {
        description: `Failed to reprocess ${singular}`,
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────

  const openDeleteDialog = () => setIsDeleteDialogOpen(true);

  const confirmDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/api/${contentType}/${item.id}`, { method: "DELETE" });
      setIsDeleteDialogOpen(false);
      toast.success(`${label} deleted`, {
        description: `The ${singular} has been deleted.`,
      });
      onDeleted();
    } catch {
      toast.error("Error", {
        description: `Failed to delete ${singular}`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    // Pin / Flag
    handlePinToggle,
    handleFlagToggle,
    handleFlagColorChange,
    // Chat
    handleChatClick,
    // Reprocess
    handleReprocess,
    isReprocessing,
    showReprocessDialog,
    setShowReprocessDialog,
    // Delete
    openDeleteDialog,
    confirmDelete,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isDeleting,
    // Utilities
    isJobStuck: item ? isJobStuck(item) : false,
    label,
  };
}
