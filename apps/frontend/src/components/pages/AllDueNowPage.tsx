import { AlertTriangle } from "lucide-react";

import { AllItemsList } from "@/components/all/AllItemsList";

export default function DueNowItemsPage() {
  return (
    <AllItemsList
      variant="dueNow"
      fixedFilters={{ dueStatus: "due_now" }}
      title="Due Now"
      titleIcon={
        <AlertTriangle className="h-5 w-5 md:h-8 md:w-8 text-red-500" />
      }
      subtitle="Items that are due today or overdue"
      searchPlaceholder="Search due items..."
      dialogTitle="Filter Due Items"
      dialogDescription="Filter and sort your due items by type and tags."
      emptyState={
        <div className="text-center py-10">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No due items found</p>
          <p className="text-sm text-muted-foreground mt-2">
            Items with due dates will appear here when they're due today or
            overdue.
          </p>
        </div>
      }
    />
  );
}
