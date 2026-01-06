import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { AssistantPreferencesProvider } from "@/providers/AssistantPreferencesProvider";
import type { RouterContext } from "@/router";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AssistantPreferencesProvider>
        <Outlet />
      </AssistantPreferencesProvider>
      <Toaster />
      <PWAInstallPrompt />
    </ThemeProvider>
  ),
});
