import { createFileRoute, redirect, Outlet, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { MainLayoutClient } from "@/components/dashboard/main-layout-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

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

function RouteErrorComponent({ error }: { error: Error }) {
  const router = useRouter();

  return (
    <MainLayoutClient>
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
        <div className="flex flex-col items-center text-center max-w-md space-y-4">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-muted-foreground">
            {error.message || "An unexpected error occurred while loading this page."}
          </p>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => router.invalidate()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button
              onClick={() => router.navigate({ to: "/dashboard" })}
            >
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </MainLayoutClient>
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
  errorComponent: RouteErrorComponent,
});
