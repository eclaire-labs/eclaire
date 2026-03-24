import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const MediaIndexPage = lazy(() => import("@/components/pages/MediaPage"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/media/")({
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <MediaIndexPage />
    </Suspense>
  ),
});
