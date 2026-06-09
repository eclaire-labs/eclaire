import { Pin } from "lucide-react";

import { AllItemsList } from "@/components/all/AllItemsList";

export default function PinnedItemsPage() {
  return (
    <AllItemsList
      variant="pinned"
      fixedFilters={{ isPinned: true }}
      title="Pinned Items"
      titleIcon={<Pin className="h-5 w-5 md:h-8 md:w-8 text-blue-500" />}
      subtitle="Your most important items, pinned for quick access"
      searchPlaceholder="Search pinned items..."
      dialogTitle="Filter Pinned Items"
      dialogDescription="Filter and sort your pinned items by type and tags."
      emptyState={
        <div className="text-center py-10">
          <Pin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No pinned items found</p>
          <p className="text-sm text-muted-foreground mt-2">
            Pin important items to find them quickly here.
          </p>
        </div>
      }
    />
  );
}
