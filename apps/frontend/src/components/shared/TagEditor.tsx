import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagEditorProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  className?: string;
}

export function TagEditor({
  tags,
  onAddTag,
  onRemoveTag,
  className,
}: TagEditorProps) {
  const [tagInput, setTagInput] = useState("");

  const handleAdd = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    if (!tags.includes(tag)) {
      onAddTag(tag);
    }
    setTagInput("");
  };

  return (
    <div className={className ?? "space-y-2"}>
      <Label>Tags</Label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {tag}
              <button
                type="button"
                className="ml-1 text-muted-foreground hover:text-foreground focus:outline-none"
                onClick={() => onRemoveTag(tag)}
                aria-label={`Remove tag ${tag}`}
              >
                &times;
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Add a tag..."
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  );
}
