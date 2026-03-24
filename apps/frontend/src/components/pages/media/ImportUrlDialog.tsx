import { Loader2 } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
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

interface ImportUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    url: string;
    title?: string;
    description?: string;
    tags: string[];
  }) => Promise<void>;
  isSubmitting: boolean;
  defaultUrl?: string;
}

export function ImportUrlDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  defaultUrl,
}: ImportUrlDialogProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or defaultUrl changes
  useEffect(() => {
    if (open) {
      setUrl(defaultUrl || "");
      setTitle("");
      setDescription("");
      setTags([]);
      setUrlError(null);
    }
  }, [open, defaultUrl]);

  const validateUrl = (value: string): boolean => {
    if (!value.trim()) {
      setUrlError("URL is required");
      return false;
    }
    try {
      const parsed = new URL(value.trim());
      if (!parsed.protocol.startsWith("http")) {
        setUrlError("URL must start with http:// or https://");
        return false;
      }
      setUrlError(null);
      return true;
    } catch {
      setUrlError("Please enter a valid URL");
      return false;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateUrl(url)) return;

    await onSubmit({
      url: url.trim(),
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      tags,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Import Media from URL</DialogTitle>
            <DialogDescription>
              Paste a URL to download and process media. Supports YouTube,
              Vimeo, SoundCloud, and direct file links.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="import-url">
                URL <span className="text-red-500">*</span>
              </Label>
              <Input
                id="import-url"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (urlError) validateUrl(e.target.value);
                }}
                onBlur={() => url && validateUrl(url)}
                autoFocus
              />
              {urlError && (
                <p className="text-sm text-destructive">{urlError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-title">Title</Label>
              <Input
                id="import-title"
                placeholder="Auto-detected from source if left blank"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="import-description">Description</Label>
              <Textarea
                id="import-description"
                rows={2}
                placeholder="Optional notes about this media"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <TagEditor
              tags={tags}
              onAddTag={(tag) => setTags([...tags, tag])}
              onRemoveTag={(tag) => setTags(tags.filter((t) => t !== tag))}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting || !url.trim()}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
