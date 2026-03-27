import { Link } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  Calendar,
  CheckSquare,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useUpcoming, type UpcomingItem } from "@/hooks/use-upcoming";

function formatRelativeTime(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "overdue";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

function formatAbsoluteTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today at ${time}`;
  if (isTomorrow) return `Tomorrow at ${time}`;
  const datePart = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${datePart} at ${time}`;
}

function SourceIcon({ item }: { item: UpcomingItem }) {
  if (item.sourceType === "task") {
    return <CheckSquare className="h-4 w-4 text-blue-500" />;
  }
  if (item.sourceType === "scheduled_action") {
    return item.kind === "agent_run" ? (
      <Bot className="h-4 w-4 text-purple-500" />
    ) : (
      <Bell className="h-4 w-4 text-amber-500" />
    );
  }
  // task_series
  return <RefreshCw className="h-4 w-4 text-green-500" />;
}

function SourceBadge({ item }: { item: UpcomingItem }) {
  if (item.sourceType === "task") {
    return (
      <Badge variant="outline" className="text-xs">
        Task
      </Badge>
    );
  }
  if (item.sourceType === "scheduled_action") {
    return (
      <Badge variant="outline" className="text-xs">
        {item.kind === "agent_run" ? "Agent Run" : "Reminder"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      Series
    </Badge>
  );
}

function UpcomingItemRow({ item }: { item: UpcomingItem }) {
  return (
    <Link to={item.linkTo}>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors rounded-md">
        <SourceIcon item={item} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {formatAbsoluteTime(item.when)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {item.executionMode && item.executionMode !== "manual" && (
            <Badge variant="outline" className="text-xs gap-1 py-0">
              <Bot className="h-3 w-3" />
              {item.executionMode === "agent_assists" ? "Assists" : "Auto"}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(item.when)}
          </span>
          <SourceBadge item={item} />
        </div>
      </div>
    </Link>
  );
}

export default function UpcomingPage() {
  const { items, isLoading } = useUpcoming({ limit: 30 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Upcoming</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Tasks, reminders, and scheduled work
        </p>
      </div>

      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">Nothing upcoming</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tasks with due dates, scheduled reminders, and recurring series
                will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <UpcomingItemRow
                  key={`${item.sourceType}-${item.id}`}
                  item={item}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
