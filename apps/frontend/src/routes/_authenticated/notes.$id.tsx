import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const NoteDetailClient = lazy(() =>
  import("@/components/pages/NoteDetailPage").then((m) => ({
    default: m.NoteDetailClient,
  })),
);

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/notes/$id")({
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <NoteDetailClient />
    </Suspense>
  ),
});
