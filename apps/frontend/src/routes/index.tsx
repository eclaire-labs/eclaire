import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    if (context.auth.isLoading || context.auth.isAuthenticated) {
      // Check if admin needs to complete onboarding
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
          // API error — fall through to dashboard
        }
      }
      throw redirect({ to: "/dashboard" });
    }

    // Not authenticated — check if this is a fresh install (no users)
    try {
      const res = await fetch("/api/onboarding/state");
      if (res.ok) {
        const state = (await res.json()) as {
          status: string;
          userCount: number;
        };
        if (state.userCount === 0) {
          throw redirect({ to: "/setup" });
        }
      }
    } catch (e) {
      if (e instanceof Error && "to" in e) throw e;
      // API error — fall through to login
    }

    throw redirect({
      to: "/auth/login",
      search: { callbackUrl: "/dashboard" },
    });
  },
});
