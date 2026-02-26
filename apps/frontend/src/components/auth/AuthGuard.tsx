import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";
import { AuthLoadingSkeleton } from "@/components/auth/AuthLoadingSkeleton";
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
      navigate({
        to: "/auth/login",
        search: { callbackUrl: pathname },
        replace: true,
      });
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
