import { useCallback } from "react";

export interface KeyboardNavConfig {
  itemCount: number;
  viewMode: string;
  /** Columns per row in tile view (for ArrowUp/Down navigation). Defaults to 3. */
  tileColumns?: number;
  onSelect?: (index: number) => void;
  onEdit?: (index: number) => void;
  onDelete?: (index: number) => void;
  onEscape?: () => void;
}

export interface KeyboardNavResult {
  handleKeyDown: (event: React.KeyboardEvent) => void;
}

export function useListKeyboardNavigation(
  focusedIndex: number,
  setFocusedIndex: (index: number) => void,
  containerRef: React.RefObject<HTMLElement | null>,
  config: KeyboardNavConfig,
): KeyboardNavResult {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const { itemCount, viewMode, tileColumns = 3 } = config;
      if (!itemCount) return;

      const active = document.activeElement;
      const isInputFocused =
        active?.tagName === "INPUT" ||
        active?.tagName === "TEXTAREA" ||
        active?.getAttribute("role") === "combobox";

      if (
        isInputFocused &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        return;
      }

      const itemsPerRow = viewMode === "tile" ? tileColumns : 1;
      let newIndex = focusedIndex;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          newIndex = Math.min(itemCount - 1, focusedIndex + itemsPerRow);
          break;
        case "ArrowUp":
          event.preventDefault();
          newIndex = Math.max(0, focusedIndex - itemsPerRow);
          break;
        case "ArrowRight":
          event.preventDefault();
          newIndex =
            focusedIndex < 0 ? 0 : Math.min(itemCount - 1, focusedIndex + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          newIndex = focusedIndex < 0 ? 0 : Math.max(0, focusedIndex - 1);
          break;
        case "Enter":
        case " ":
          if (focusedIndex >= 0 && focusedIndex < itemCount) {
            event.preventDefault();
            config.onSelect?.(focusedIndex);
          }
          break;
        case "e":
          if (
            !isInputFocused &&
            focusedIndex >= 0 &&
            focusedIndex < itemCount
          ) {
            event.preventDefault();
            config.onEdit?.(focusedIndex);
          }
          break;
        case "Delete":
        case "Backspace":
          if (
            !isInputFocused &&
            focusedIndex >= 0 &&
            focusedIndex < itemCount
          ) {
            event.preventDefault();
            config.onDelete?.(focusedIndex);
          }
          break;
        case "Home":
          event.preventDefault();
          newIndex = 0;
          break;
        case "End":
          event.preventDefault();
          newIndex = itemCount - 1;
          break;
        case "Escape":
          setFocusedIndex(-1);
          (event.target as HTMLElement).blur();
          config.onEscape?.();
          return;
        default:
          return;
      }

      if (newIndex !== focusedIndex && newIndex >= 0) {
        setFocusedIndex(newIndex);
        const el = containerRef.current?.querySelector(
          `[data-index="${newIndex}"]`,
        ) as HTMLElement | null;
        el?.focus();
      }
    },
    [focusedIndex, setFocusedIndex, containerRef, config],
  );

  return { handleKeyDown };
}
