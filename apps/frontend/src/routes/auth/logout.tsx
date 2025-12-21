import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const LogoutPage = lazy(() => import("@/components/pages/auth/LogoutPage"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/auth/logout")({
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <LogoutPage />
    </Suspense>
  ),
});
