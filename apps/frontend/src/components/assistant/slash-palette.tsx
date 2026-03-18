import type { SlashItem } from "@eclaire/core/slash";
import { groupSlashItems } from "@eclaire/core/slash";
import {
  Bot,
  Brain,
  Cpu,
  HelpCircle,
  History,
  LogOut,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Plus,
  History,
  Cpu,
  Brain,
  Trash2,
  HelpCircle,
  LogOut,
  Bot,
  Sparkles,
};

interface SlashPaletteProps {
  open: boolean;
  items: SlashItem[];
  onSelect: (item: SlashItem) => void;
  onClose: () => void;
}

export function SlashPalette({
  open,
  items,
  onSelect,
  onClose,
}: SlashPaletteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when items change
  // biome-ignore lint/correctness/useExhaustiveDependencies: items identity change triggers reset
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  // Scroll selected item into view
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedIndex triggers scroll
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector("[data-selected=true]");
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const groups = useMemo(() => groupSlashItems(items), [items]);

  // Build flat list for keyboard navigation
  const flatItems = useMemo(() => items, [items]);

  // Global keyboard handler — attached to the window when palette is open
  useEffect(() => {
    if (!open || flatItems.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < flatItems.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : flatItems.length - 1,
          );
          break;
        case "Tab":
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            onSelect(flatItems[selectedIndex]);
          }
          break;
        case "Enter":
          // Only handle Enter when the palette is open and has items
          // The parent will also get this event for send — we select the item
          // and the parent's interceptSend will handle it
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, flatItems, selectedIndex, onSelect, onClose]);

  if (!open || items.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 z-50 max-h-[280px] overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-md"
    >
      {groups.map((group) => (
        <div key={group.kind} className="p-1">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {group.label}
          </div>
          {group.items.map((item) => {
            const itemIndex = flatItems.indexOf(item);
            const isSelected = itemIndex === selectedIndex;
            const IconComponent = item.icon ? ICON_MAP[item.icon] : null;

            return (
              <button
                type="button"
                key={`${item.kind}-${item.id}`}
                data-selected={isSelected}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none cursor-default select-none",
                  isSelected && "bg-accent text-accent-foreground",
                )}
                onMouseEnter={() => setSelectedIndex(itemIndex)}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent textarea blur
                  onSelect(item);
                }}
              >
                {IconComponent && (
                  <IconComponent className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-medium">/{item.label}</span>
                <span className="ml-auto text-xs text-muted-foreground truncate">
                  {item.description}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
