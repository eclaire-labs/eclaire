import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.auth.isLoading || context.auth.isAuthenticated) {
      throw redirect({ to: "/dashboard" });
    }
    throw redirect({
      to: "/auth/login",
      search: { callbackUrl: "/dashboard" },
    });
  },
});
