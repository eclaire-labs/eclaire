import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TAB_TO_SECTION } from "@/components/settings/settings-nav-config";

const SettingsOverview = lazy(
  () => import("@/components/settings/SettingsOverview"),
);

export const Route = createFileRoute("/_settingsLayout/settings/")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  beforeLoad: ({ search }) => {
    // Redirect legacy ?tab= URLs to new nested paths
    if (search.tab) {
      const section = TAB_TO_SECTION[search.tab] || search.tab;
      throw redirect({
        to: "/settings/$section",
        params: { section },
      });
    }
  },
  component: () => (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <SettingsOverview />
    </Suspense>
  ),
});
