import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import { DashboardClientContent } from "@/components/dashboard/DashboardClientContent";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useOnboardingState } from "@/hooks/use-onboarding";
import { apiFetch } from "@/lib/api-client";

interface DashboardData {
  // biome-ignore lint/suspicious/noExplicitAny: untyped API response
  stats: any;
  // biome-ignore lint/suspicious/noExplicitAny: untyped API response
  recentActivities: any[];
  // biome-ignore lint/suspicious/noExplicitAny: untyped API response
  activityTimeline: any[];
  // biome-ignore lint/suspicious/noExplicitAny: untyped API response
  dueItems: any;
  // biome-ignore lint/suspicious/noExplicitAny: untyped API response
  quickStats: any;
}

async function fetchDashboardData(): Promise<DashboardData> {
  const [statsRes, activityRes, timelineRes, dueItemsRes, quickStatsRes] =
    await Promise.all([
      apiFetch("/api/user/dashboard-stats"),
      apiFetch("/api/history?limit=5"),
      apiFetch("/api/user/activity-timeline?days=30"),
      apiFetch("/api/user/due-items"),
      apiFetch("/api/user/quick-stats"),
    ]);

  const [stats, activityData, timeline, dueItems, quickStats] =
    await Promise.all([
      statsRes.ok ? statsRes.json() : null,
      activityRes.ok ? activityRes.json() : { records: [] },
      timelineRes.ok ? timelineRes.json() : [],
      dueItemsRes.ok
        ? dueItemsRes.json()
        : { overdue: [], dueToday: [], dueThisWeek: [] },
      quickStatsRes.ok ? quickStatsRes.json() : null,
    ]);

  return {
    stats,
    recentActivities: Array.isArray(activityData.records)
      ? activityData.records
      : [],
    activityTimeline: Array.isArray(timeline) ? timeline : [],
    dueItems,
    quickStats,
  };
}

export default function DashboardPage() {
  const { data: session, isPending: isSessionPending } = useAuth();

  // Set document title
  useEffect(() => {
    document.title = "Dashboard — Eclaire";
  }, []);

  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", session?.user?.id],
    queryFn: fetchDashboardData,
    enabled: !!session?.user?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Show skeleton while loading session or data
  if (isSessionPending || isLoading) {
    return <DashboardSkeleton />;
  }

  // If no session, the AuthGuard in the layout will handle redirect
  if (!session?.user) {
    return <DashboardSkeleton />;
  }

  // Show skeleton if data hasn't loaded yet
  if (!dashboardData) {
    return <DashboardSkeleton />;
  }

  const userName =
    session.user.name ||
    // biome-ignore lint/suspicious/noExplicitAny: auth user type lacks displayName
    (session.user as any).displayName ||
    session.user.email;

  return (
    <>
      <SetupBanner />
      <DashboardClientContent
        userName={userName}
        initialStats={dashboardData.stats}
        initialActivity={dashboardData.recentActivities}
        initialTimeline={dashboardData.activityTimeline}
        initialDueItems={dashboardData.dueItems}
        initialQuickStats={dashboardData.quickStats}
      />
    </>
  );
}

function SetupBanner() {
  const { data: authData } = useAuth();
  const isAdmin =
    (authData?.user as Record<string, unknown> | undefined)?.isInstanceAdmin ===
    true;
  const { data: state } = useOnboardingState(isAdmin);

  if (!isAdmin || !state || state.status === "completed") return null;

  return (
    <Alert className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
      <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle>Finish Setting Up Eclaire</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          Complete the setup wizard to configure your instance and unlock all
          features.
        </span>
        <Link to="/setup">
          <Button size="sm" variant="outline" className="ml-4 shrink-0">
            Continue Setup
          </Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}
