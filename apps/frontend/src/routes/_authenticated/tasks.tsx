import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const TasksIndexPage = lazy(() => import("@/components/pages/TasksPage"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/tasks")({
  validateSearch: (search: Record<string, unknown>): { openDialog?: string } => ({
    openDialog: typeof search.openDialog === "string" ? search.openDialog : undefined,
  }),
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <TasksIndexPage />
    </Suspense>
  ),
});
