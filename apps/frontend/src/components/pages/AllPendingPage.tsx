import { Clock } from "lucide-react";

import { AllItemsList } from "@/components/all/AllItemsList";

export default function PendingItemsPage() {
  return (
    <AllItemsList
      variant="pending"
      fixedFilters={{ reviewStatus: "pending" }}
      title="Pending Items"
      titleIcon={<Clock className="h-5 w-5 md:h-8 md:w-8 text-orange-500" />}
      subtitle="Items awaiting review and approval"
      searchPlaceholder="Search pending items..."
      dialogTitle="Filter Pending Items"
      dialogDescription="Filter and sort your pending items by type and tags."
      emptyState={
        <div className="text-center py-10">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No pending items found</p>
          <p className="text-sm text-muted-foreground mt-2">
            All items have been reviewed or no items match your search criteria.
          </p>
        </div>
      }
    />
  );
}
