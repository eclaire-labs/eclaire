import { Flag } from "lucide-react";

import { AllItemsList } from "@/components/all/AllItemsList";

export default function FlaggedItemsPage() {
  return (
    <AllItemsList
      variant="flagged"
      fixedFilters={{ flagged: true }}
      title="Flagged Items"
      titleIcon={<Flag className="h-5 w-5 md:h-8 md:w-8 text-orange-500" />}
      subtitle="Items you've flagged for attention or follow-up"
      searchPlaceholder="Search flagged items..."
      dialogTitle="Filter Flagged Items"
      dialogDescription="Filter and sort your flagged items by type, tags, and flag colors."
      emptyState={
        <div className="text-center py-10">
          <Flag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No flagged items found</p>
          <p className="text-sm text-muted-foreground mt-2">
            Flag important items to track them here.
          </p>
        </div>
      }
    />
  );
}
