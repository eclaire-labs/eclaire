import { useState } from "react";
import { DueDatePicker } from "@/components/shared/due-date-picker";
import { TagEditor } from "@/components/shared/TagEditor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CreateNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNote: (data: {
    title: string;
    content: string;
    dueDate?: string;
    tags: string[];
  }) => Promise<void>;
  isCreating: boolean;
}

const EMPTY_STATE = {
  title: "",
  content: "",
  dueDate: null as string | null,
  tags: [] as string[],
};

export function CreateNoteDialog({
  open,
  onOpenChange,
  onCreateNote,
  isCreating,
}: CreateNoteDialogProps) {
  const [form, setForm] = useState(EMPTY_STATE);

  const reset = () => setForm(EMPTY_STATE);

  const handleCreate = async () => {
    await onCreateNote({
      title: form.title,
      content: form.content || "",
      dueDate: form.dueDate || undefined,
      tags: form.tags,
    });
    reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>New Note Entry</DialogTitle>
          <DialogDescription>
            Create a new note entry to record your thoughts.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-title">Title</Label>
              <Input
                id="new-title"
                placeholder="Enter a title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-content">Content (optional)</Label>
              <Textarea
                id="new-content"
                placeholder="Add content to your note (optional)..."
                rows={8}
                value={form.content || ""}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-due-date">Due Date (optional)</Label>
              <DueDatePicker
                value={form.dueDate}
                onChange={(value) =>
                  setForm({
                    ...form,
                    dueDate: value,
                  })
                }
              />
            </div>
            <TagEditor
              tags={form.tags}
              onAddTag={(tag) =>
                setForm({ ...form, tags: [...form.tags, tag] })
              }
              onRemoveTag={(tag) =>
                setForm({ ...form, tags: form.tags.filter((t) => t !== tag) })
              }
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!form.title.trim() || isCreating}>
              Create Entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
