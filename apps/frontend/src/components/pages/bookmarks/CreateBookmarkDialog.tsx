import { Loader2 } from "lucide-react";
import { useState } from "react";
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

/** Normalize URLs by adding protocol if missing. */
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.match(/^https?:\/\//i)) return trimmed;
  return `https://${trimmed}`;
}

interface CreateBookmarkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateBookmark: (url: string) => Promise<void>;
  isCreating: boolean;
}

export function CreateBookmarkDialog({
  open,
  onOpenChange,
  onCreateBookmark,
  isCreating,
}: CreateBookmarkDialogProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!url.trim()) {
      setError("Please enter a valid URL.");
      return;
    }

    const normalizedUrl = normalizeUrl(url);

    if (!URL.canParse(normalizedUrl)) {
      setError("Please enter a valid URL.");
      return;
    }

    setError(null);
    await onCreateBookmark(normalizedUrl);
    setUrl("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setUrl("");
          setError(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Bookmark</DialogTitle>
          <DialogDescription>
            Enter the URL of the page you want to save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
