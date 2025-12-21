import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const PhotosIndexPage = lazy(() => import("@/components/pages/PhotosPage"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/photos")({
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <PhotosIndexPage />
    </Suspense>
  ),
});
