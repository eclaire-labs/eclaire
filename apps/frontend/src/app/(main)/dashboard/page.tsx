import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Dashboard",
};

import { Suspense } from "react";
import { DashboardClientContent } from "@/components/dashboard/DashboardClientContent";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { getCurrentUser, type User } from "@/lib/auth.server"; // Correctly importing from the .server file
import {
  getActivityTimeline,
  getDashboardStats,
  getDueItems,
  getQuickStats,
  getRecentActivity,
} from "@/lib/data-fetching";

// This line explicitly tells Next.js that this page MUST be rendered dynamically.
// It silences the "Dynamic server usage" build notification because you are acknowledging the behavior.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // 1. Get the user session on the server.
  const user = await getCurrentUser();

  // 2. Redirect if the user somehow bypassed middleware.
  if (!user) {
    redirect("/auth/login");
  }

  // 3. Render the page using Suspense for a better loading experience.
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardDataFetcher user={user} />
    </Suspense>
  );
}

// This component fetches the actual dashboard data.
async function DashboardDataFetcher({ user }: { user: User }) {
  // 4. Fetch dashboard-specific data on the server in parallel.
  const [stats, recentActivities, activityTimeline, dueItems, quickStats] =
    await Promise.all([
      getDashboardStats(user.id),
      getRecentActivity(user.id),
      getActivityTimeline(user.id),
      getDueItems(user.id),
      getQuickStats(user.id),
    ]);

  // 5. Pass all server-fetched data as props to the Client Component.
  return (
    <DashboardClientContent
      userName={user.name || user.email}
      initialStats={stats}
      initialActivity={recentActivities}
      initialTimeline={activityTimeline}
      initialDueItems={dueItems}
      initialQuickStats={quickStats}
    />
  );
}
