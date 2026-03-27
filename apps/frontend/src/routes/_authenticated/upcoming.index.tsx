import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const UpcomingPage = lazy(() => import("@/components/pages/UpcomingPage"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/upcoming/")({
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <UpcomingPage />
    </Suspense>
  ),
});
