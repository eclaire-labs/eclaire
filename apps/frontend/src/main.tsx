import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useSession } from "@/lib/auth";
import { QueryProvider } from "@/providers/QueryProvider";
import { SessionProvider } from "@/providers/SessionProvider";
import { router } from "./router";
import "./styles/globals.css";

function InnerApp() {
  const { data: session, isPending } = useSession();

  return (
    <RouterProvider
      router={router}
      context={{
        auth: {
          isAuthenticated: !!session?.user,
          isLoading: isPending,
          user: session?.user ?? null,
        },
      }}
    />
  );
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

// SessionProvider must wrap InnerApp so useSession() works
// QueryProvider is needed for React Query hooks used by Better Auth
createRoot(rootElement).render(
  <StrictMode>
    <QueryProvider>
      <SessionProvider>
        <InnerApp />
      </SessionProvider>
    </QueryProvider>
  </StrictMode>,
);
