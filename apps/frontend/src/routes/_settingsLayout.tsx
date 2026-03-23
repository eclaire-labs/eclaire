import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthLoadingSkeleton } from "@/components/auth/AuthLoadingSkeleton";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/_settingsLayout")({
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
  component: function SettingsLayoutRoute() {
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

    return <Outlet />;
  },
  pendingComponent: AuthLoadingSkeleton,
});
