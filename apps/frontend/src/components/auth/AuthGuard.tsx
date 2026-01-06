import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Client-side authentication guard for protected routes.
 * Redirects unauthenticated users to the login page.
 * Shows a loading skeleton while checking authentication status.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    // Wait until session check is complete
    if (isPending) return;

    // If no session, redirect to login with callback URL
    if (!session?.user) {
      const callbackUrl = encodeURIComponent(pathname);
      navigate({ to: `/auth/login?callbackUrl=${callbackUrl}`, replace: true });
    }
  }, [session, isPending, navigate, pathname]);

  // Show loading state while checking session
  if (isPending) {
    return <AuthLoadingSkeleton />;
  }

  // Show loading while redirecting (session is null but not pending)
  if (!session?.user) {
    return <AuthLoadingSkeleton />;
  }

  // User is authenticated, render children
  return <>{children}</>;
}

/**
 * Simple loading skeleton shown while checking authentication
 */
function AuthLoadingSkeleton() {
  return (
    <div className="flex flex-col h-screen">
      {/* Top bar skeleton */}
      <div className="h-14 border-b bg-background flex items-center px-4">
        <Skeleton className="h-8 w-32" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>

      {/* Main content skeleton */}
      <div className="flex flex-1">
        {/* Sidebar skeleton */}
        <div className="w-48 border-r bg-background p-3 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>

        {/* Content skeleton */}
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
