import React from "react";
import { getGroupDateLabel } from "@/lib/list-page-utils";

export interface GroupedItemListProps<TItem extends { id: string }> {
  items: TItem[];
  isGrouped: boolean;
  getGroupDate: (item: TItem) => string | number | null;
  renderItem: (item: TItem, index: number) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  containerRef?: React.RefObject<HTMLElement | null>;
  onKeyDown?: (event: React.KeyboardEvent) => void;
}

export function GroupedItemList<TItem extends { id: string }>({
  items,
  isGrouped,
  getGroupDate,
  renderItem,
  className,
  style,
  containerRef,
  onKeyDown,
}: GroupedItemListProps<TItem>) {
  let lastGroupLabel = "";

  return (
    <section
      ref={containerRef as React.RefObject<HTMLElement>}
      onKeyDown={onKeyDown}
      aria-label="Item list navigation"
      className={`outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md ${className ?? ""}`}
      style={style}
    >
      {items.map((item, index) => {
        const currentGroupLabel = isGrouped
          ? getGroupDateLabel(getGroupDate(item))
          : "";
        const showGroupHeader =
          isGrouped && currentGroupLabel !== lastGroupLabel;
        if (showGroupHeader) {
          lastGroupLabel = currentGroupLabel;
        }

        return (
          <React.Fragment key={item.id}>
            {showGroupHeader && (
              <h2 className="col-span-full text-lg font-semibold mt-6 mb-2 pl-1 border-b pb-1">
                {currentGroupLabel}
              </h2>
            )}
            {renderItem(item, index)}
          </React.Fragment>
        );
      })}
    </section>
  );
}
