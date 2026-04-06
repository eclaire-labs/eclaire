import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    // Fetch onboarding state once (public when no users exist)
    let onboardingState: { status: string; userCount: number } | null = null;
    try {
      const res = await fetch("/api/onboarding/state", {
        credentials: "include",
      });
      if (res.ok) {
        onboardingState = (await res.json()) as {
          status: string;
          userCount: number;
        };
      }
    } catch {
      // API error — fall through
    }

    // Fresh install — always go to setup regardless of auth state
    if (onboardingState?.userCount === 0) {
      throw redirect({ to: "/setup" });
    }

    if (context.auth.isLoading || context.auth.isAuthenticated) {
      // Admin with incomplete onboarding — go to setup
      if (
        context.auth.user?.isInstanceAdmin &&
        onboardingState &&
        onboardingState.status !== "completed"
      ) {
        throw redirect({ to: "/setup" });
      }
      throw redirect({ to: "/dashboard" });
    }

    throw redirect({
      to: "/auth/login",
      search: { callbackUrl: "/dashboard" },
    });
  },
});
