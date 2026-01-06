import { createFileRoute, useRouter } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
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

function DetailErrorComponent({ error }: { error: Error }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
      <div className="flex flex-col items-center text-center max-w-md space-y-4">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Unable to load document</h2>
        <p className="text-muted-foreground">
          {error.message ||
            "The document could not be found or an error occurred."}
        </p>
        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={() => router.invalidate()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try again
          </Button>
          <Button onClick={() => router.navigate({ to: "/documents" })}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Documents
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/documents/$id")({
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <DocumentDetailClient />
    </Suspense>
  ),
  errorComponent: DetailErrorComponent,
});
