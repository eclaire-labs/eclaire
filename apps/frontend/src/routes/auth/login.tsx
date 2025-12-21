import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const LoginPage = lazy(() => import("@/components/pages/auth/LoginPage"));

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/auth/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    callbackUrl: (search.callbackUrl as string) || "/dashboard",
  }),
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <LoginPage />
    </Suspense>
  ),
});
