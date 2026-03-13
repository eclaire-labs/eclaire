import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const SettingsPage = lazy(() => import("@/components/pages/SettingsPage"));

const validTabs = [
  "profile",
  "account",
  "appearance",
  "assistant",
  "notifications",
  "api-keys",
  "about",
] as const;
type SettingsTab = (typeof validTabs)[number];

function PageLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Skeleton className="h-8 w-32" />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: SettingsTab; agentActorId?: string } => {
    const tab = search.tab as string | undefined;
    return {
      tab:
        tab && validTabs.includes(tab as SettingsTab)
          ? (tab as SettingsTab)
          : undefined,
      agentActorId:
        typeof search.agentActorId === "string" &&
        search.agentActorId.length > 0
          ? search.agentActorId
          : undefined,
    };
  },
  component: () => (
    <Suspense fallback={<PageLoading />}>
      <SettingsPage />
    </Suspense>
  ),
});
