import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const DocumentDetailClient = lazy(() =>
  import("@/components/pages/DocumentDetailPage").then((m) => ({
    default: m.DocumentDetailClient,
  })),
);

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/documents/$id")({
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <DocumentDetailClient />
    </Suspense>
  ),
});
