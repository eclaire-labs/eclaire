import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const SetupWizard = lazy(() => import("@/components/setup/SetupWizard"));

function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Skeleton className="h-96 w-[600px]" />
    </div>
  );
}

export const Route = createFileRoute("/setup")({
  beforeLoad: async ({ context }) => {
    // Fetch onboarding state to decide routing
    try {
      const res = await fetch("/api/onboarding/state", {
        credentials: "include",
      });
      if (res.ok) {
        const state = (await res.json()) as {
          status: string;
          userCount: number;
        };
        // If onboarding is already complete, redirect to dashboard
        if (state.status === "completed") {
          throw redirect({ to: "/dashboard" });
        }
        // If users exist but current user is not admin, redirect to dashboard
        if (
          state.userCount > 0 &&
          context.auth.isAuthenticated &&
          !context.auth.user?.isInstanceAdmin
        ) {
          throw redirect({ to: "/dashboard" });
        }
      }
    } catch (e) {
      // If it's a redirect, re-throw it
      if (e instanceof Error && "to" in e) throw e;
      // Otherwise continue to show setup page (API might be starting up)
    }
  },
  component: function SetupPage() {
    return (
      <Suspense fallback={<Loading />}>
        <SetupWizard />
      </Suspense>
    );
  },
});
