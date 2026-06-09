import { Loader2 } from "lucide-react";
import type React from "react";

import { TagEditor } from "@/components/shared/TagEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EditPhotoState } from "@/types/photo";

interface PhotoEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPhoto: EditPhotoState | null;
  setEditingPhoto: React.Dispatch<React.SetStateAction<EditPhotoState | null>>;
  onSubmit: (event: React.FormEvent) => void;
  isUpdating: boolean;
}

/** Dialog form for editing photo metadata (title, description, tags, device). */
export function PhotoEditDialog({
  open,
  onOpenChange,
  editingPhoto,
  setEditingPhoto,
  onSubmit,
  isUpdating,
}: PhotoEditDialogProps) {
  const handleEditingPhotoChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setEditingPhoto((prev) =>
      prev ? { ...prev, [name]: value === null ? null : value } : null,
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Photo Metadata</DialogTitle>
            <DialogDescription>
              Make changes to the details of "{editingPhoto?.title}". File
              content and EXIF data cannot be changed here.
            </DialogDescription>
          </DialogHeader>
          {editingPhoto && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-title"
                  name="title"
                  value={editingPhoto.title}
                  onChange={handleEditingPhotoChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  name="description"
                  rows={3}
                  value={editingPhoto.description ?? ""}
                  onChange={handleEditingPhotoChange}
                />
              </div>
              <TagEditor
                tags={editingPhoto.tags}
                onAddTag={(tag) =>
                  setEditingPhoto({
                    ...editingPhoto,
                    tags: [...editingPhoto.tags, tag],
                  })
                }
                onRemoveTag={(tag) =>
                  setEditingPhoto({
                    ...editingPhoto,
                    tags: editingPhoto.tags.filter((t) => t !== tag),
                  })
                }
              />
              <div className="space-y-2">
                <Label htmlFor="edit-deviceId">Device ID</Label>
                <Input
                  id="edit-deviceId"
                  name="deviceId"
                  value={editingPhoto.deviceId ?? ""}
                  onChange={handleEditingPhotoChange}
                  placeholder="e.g. iPhone 15 Pro"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isUpdating || !editingPhoto?.title}>
              {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
