import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  Camera,
  CheckSquare,
  FileText,
  Folder,
  StickyNote,
} from "lucide-react";
import { useCallback, useState } from "react";
import { ActivityTimelineChart } from "@/components/dashboard/ActivityTimelineChart";
import { AssetOverviewCards } from "@/components/dashboard/AssetOverviewCards";
import { DueItemsWidget } from "@/components/dashboard/DueItemsWidget";
import { QuickStatsGrid } from "@/components/dashboard/QuickStatsGrid";
import { StorageUsageChart } from "@/components/dashboard/StorageUsageChart";
import { ProcessingSummaryDashboard } from "@/components/processing/ProcessingSummaryDashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Props passed from the Server Component
interface DashboardClientContentProps {
  userName: string;
  initialStats: any;
  initialActivity: any[];
  initialTimeline: any[];
  initialDueItems: any;
  initialQuickStats: any;
}

// --- FIX IS HERE ---
// Helper functions are now fully implemented and return valid ReactNodes.

const formatDate = (timestamp: number | string | Date) => {
  let date: Date;

  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else {
    // If it's a number, check if it's in seconds (Unix timestamp) or milliseconds
    if (timestamp < 10000000000) {
      // Likely Unix timestamp in seconds
      date = new Date(timestamp * 1000);
    } else {
      // Likely timestamp in milliseconds
      date = new Date(timestamp);
    }
  }

  // Check if the date is valid
  if (Number.isNaN(date.getTime())) {
    return "Invalid Date";
  }

  return (
    date.toLocaleDateString() +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
};

const getActionVerb = (action: string) => {
  switch (action) {
    case "create":
      return "Created";
    case "update":
      return "Updated";
    case "delete":
      return "Deleted";
    case "api_call":
      return "API Call";
    case "ai_prompt_image_response":
      return "AI Image Response";
    case "ai_prompt_text_response":
      return "AI Text Response";
    case "api_content_upload":
      return "Content Upload";
    default:
      return action;
  }
};

const getAssetTypeIcon = (itemType: string, className = "h-4 w-4") => {
  switch (itemType) {
    case "bookmark":
      return <BookOpen className={className} />;
    case "document":
      return <FileText className={className} />;
    case "photo":
      return <Camera className={className} />;
    case "note":
      return <StickyNote className={className} />;
    case "task":
      return <CheckSquare className={className} />;
    default:
      return <Folder className={className} />;
  }
};
// --- END FIX ---

export function DashboardClientContent({
  userName,
  initialStats,
  initialActivity,
  initialTimeline,
  initialDueItems,
  initialQuickStats,
}: DashboardClientContentProps) {
  const [stats, _setStats] = useState(initialStats);
  const [recentActivities, _setRecentActivities] = useState(initialActivity);
  const [timeline, setTimeline] = useState(initialTimeline);
  const [dueItems, _setDueItems] = useState(initialDueItems);
  const [quickStats, _setQuickStats] = useState(initialQuickStats);
  const [timelinePeriod, setTimelinePeriod] = useState(30);
  const [_isLoadingTimeline, setIsLoadingTimeline] = useState(false);

  // Client-side function to fetch activity timeline
  const fetchActivityTimeline = useCallback(async (days: number) => {
    setIsLoadingTimeline(true);
    try {
      const params = new URLSearchParams({ days: days.toString() });
      const response = await fetch(`/api/user/activity-timeline?${params}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error(
          "Failed to fetch activity timeline:",
          response.statusText,
        );
        return;
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        setTimeline(data);
      }
    } catch (error) {
      console.error("Error fetching activity timeline:", error);
    } finally {
      setIsLoadingTimeline(false);
    }
  }, []);

  // Handle period change
  const handlePeriodChange = useCallback(
    (newPeriod: number) => {
      setTimelinePeriod(newPeriod);
      fetchActivityTimeline(newPeriod);
    },
    [fetchActivityTimeline],
  );

  // Show loading state if stats are not available
  if (!stats) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Welcome back, {userName}!</h1>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {userName}!</h1>
      </div>

      {/* Asset Overview Cards */}
      <AssetOverviewCards stats={stats} />

      {/* Quick Stats Grid */}
      {quickStats && <QuickStatsGrid quickStats={quickStats} />}

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Row: Due Items (left) | Activity Timeline (right) */}
        {dueItems && <DueItemsWidget dueItems={dueItems} />}

        {timeline && timeline.length > 0 && (
          <ActivityTimelineChart
            data={timeline}
            period={timelinePeriod}
            onPeriodChange={handlePeriodChange}
          />
        )}

        {/* Middle Row: Storage Usage (left) | Recent Activity (right) */}
        <StorageUsageChart stats={stats} />

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest changes to your content</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities?.length > 0 ? (
                recentActivities.slice(0, 5).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center space-x-3"
                  >
                    {getAssetTypeIcon(
                      activity.itemType,
                      "h-4 w-4 text-muted-foreground",
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {getActionVerb(activity.action) === activity.itemName
                          ? activity.itemName
                          : `${getActionVerb(activity.action)}: ${activity.itemName}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(activity.timestamp)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {activity.itemType}
                    </Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recent activity
                </p>
              )}
            </div>
            {recentActivities?.length > 5 && (
              <CardFooter className="px-0 pt-4">
                <Link to="/history" className="w-full">
                  <Button variant="outline" className="w-full">
                    View All Activity
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardFooter>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Processing Jobs (full width) */}
      <Card>
        <CardHeader>
          <CardTitle>Processing Jobs</CardTitle>
          <CardDescription>
            Current status of background processing
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ProcessingSummaryDashboard noBorder={true} />
        </CardContent>
      </Card>
    </div>
  );
}
