import { useEffect, useState } from "react";
import { DashboardClientContent } from "@/components/dashboard/DashboardClientContent";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/frontend-api";

// Note: metadata export not supported in client components
// Title will be set via document.title or a head component

export default function DashboardPage() {
  const { data: session, isPending: isSessionPending } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<{
    stats: any;
    recentActivities: any[];
    activityTimeline: any[];
    dueItems: any;
    quickStats: any;
  } | null>(null);

  // Set document title
  useEffect(() => {
    document.title = "Dashboard — Eclaire";
  }, []);

  // Fetch dashboard data client-side
  useEffect(() => {
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    async function fetchDashboardData() {
      try {
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

        setDashboardData({
          stats,
          recentActivities: Array.isArray(activityData.records)
            ? activityData.records
            : [],
          activityTimeline: Array.isArray(timeline) ? timeline : [],
          dueItems,
          quickStats,
        });
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();
  }, [session?.user?.id]);

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
    session.user.name || (session.user as any).displayName || session.user.email;

  return (
    <DashboardClientContent
      userName={userName}
      initialStats={dashboardData.stats}
      initialActivity={dashboardData.recentActivities}
      initialTimeline={dashboardData.activityTimeline}
      initialDueItems={dashboardData.dueItems}
      initialQuickStats={dashboardData.quickStats}
    />
  );
}
