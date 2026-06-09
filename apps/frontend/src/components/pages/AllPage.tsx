import { getRouteApi } from "@tanstack/react-router";

import { AllItemsList } from "@/components/all/AllItemsList";

const routeApi = getRouteApi("/_authenticated/all/");

export default function AllItemsPage() {
  const { tag: tagParam } = routeApi.useSearch();

  return (
    <AllItemsList
      variant="all"
      title="All Items"
      subtitle="Search and filter across all your content"
      searchPlaceholder="Search across all items..."
      dialogTitle="Filter Items"
      dialogDescription="Filter and sort your items by type and tags."
      tagFromUrl={tagParam}
      emptyState={
        <div className="text-center py-10">
          <p className="text-muted-foreground">No items found</p>
        </div>
      }
    />
  );
}
