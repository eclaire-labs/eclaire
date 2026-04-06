import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { Suspense, useEffect } from "react";
import { AuthLoadingSkeleton } from "@/components/auth/AuthLoadingSkeleton";
import { MainLayoutClient } from "@/components/dashboard/main-layout-client";
import { useSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

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
            {error.message ||
              "An unexpected error occurred while loading this page."}
          </p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => router.invalidate()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button onClick={() => router.navigate({ to: "/dashboard" })}>
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

    // Redirect admins to /setup if onboarding is incomplete
    if (context.auth.user?.isInstanceAdmin) {
      try {
        const res = await fetch("/api/onboarding/state", {
          credentials: "include",
        });
        if (res.ok) {
          const state = (await res.json()) as { status: string };
          if (state.status !== "completed") {
            throw redirect({ to: "/setup" });
          }
        }
      } catch (e) {
        if (e instanceof Error && "to" in e) throw e;
        // API error — don't block navigation
      }
    }
  },
  component: function AuthenticatedLayout() {
    const { data: session, isPending } = useSession();
    const navigate = useNavigate();
    const { pathname } = useLocation();

    useEffect(() => {
      if (!isPending && !session?.user && !pathname.startsWith("/auth/")) {
        navigate({
          to: "/auth/login",
          search: { callbackUrl: pathname },
          replace: true,
        });
      }
    }, [session, isPending, navigate, pathname]);

    if (isPending || !session?.user) {
      return <AuthLoadingSkeleton />;
    }
    return (
      <MainLayoutClient>
        <Suspense fallback={<AuthLoadingSkeleton />}>
          <Outlet />
        </Suspense>
      </MainLayoutClient>
    );
  },
  pendingComponent: AuthLoadingSkeleton,
  errorComponent: RouteErrorComponent,
});
