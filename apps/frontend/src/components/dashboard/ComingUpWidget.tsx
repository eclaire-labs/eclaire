/**
 * Dashboard widget showing upcoming tasks (due dates, scheduled occurrences).
 */

import { Link } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  Calendar,
  CheckSquare,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useUpcoming, type UpcomingItem } from "@/hooks/use-upcoming";

function formatNextTime(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "Overdue";
  if (diff < 60_000) return "< 1 min";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function ItemIcon({ item }: { item: UpcomingItem }) {
  if (item.scheduleType === "recurring") {
    return <RefreshCw className="h-3.5 w-3.5 text-green-500 shrink-0" />;
  }
  if (item.delegateMode !== "manual") {
    return <Bot className="h-3.5 w-3.5 text-purple-500 shrink-0" />;
  }
  if (item.scheduleType === "one_time") {
    return <Bell className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
  }
  return <CheckSquare className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
}

function UpcomingRow({ item }: { item: UpcomingItem }) {
  return (
    <Link
      to="/tasks/$id"
      params={{ id: item.id }}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
    >
      <ItemIcon item={item} />
      <span className="flex-1 truncate">{item.title}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {formatNextTime(item.when)}
      </span>
    </Link>
  );
}

export function ComingUpWidget() {
  const { items, isLoading } = useUpcoming({ limit: 6 });

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Calendar className="h-5 w-5" />
          <span>Coming Up</span>
        </CardTitle>
        <CardDescription>Tasks, reminders, and scheduled work</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              <Clock className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center py-4 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">Nothing upcoming</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {items.map((item) => (
                <UpcomingRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
        <div className="pt-4 mt-auto">
          <Link to="/tasks">
            <Button variant="outline" size="sm" className="w-full">
              View All Tasks
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
