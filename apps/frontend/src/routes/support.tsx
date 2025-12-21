import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const SupportPage = lazy(() => import("@/components/pages/SupportPage"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/support")({
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <SupportPage />
    </Suspense>
  ),
});
