import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { MainLayoutClient } from "@/components/dashboard/main-layout-client";
import { Skeleton } from "@/components/ui/skeleton";

function AuthLoadingSkeleton() {
  return (
    <div className="flex flex-col h-screen">
      <div className="h-14 border-b bg-background flex items-center px-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="flex flex-1">
        <div className="w-48 border-r bg-background p-3 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    if (context.auth.isLoading) {
      return;
    }
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/auth/login",
        search: { callbackUrl: location.pathname },
      });
    }
  },
  component: () => (
    <MainLayoutClient>
      <Suspense fallback={<AuthLoadingSkeleton />}>
        <Outlet />
      </Suspense>
    </MainLayoutClient>
  ),
  pendingComponent: AuthLoadingSkeleton,
});
