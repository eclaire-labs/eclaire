/**
 * Dashboard widget showing upcoming scheduled actions.
 */

import { Link } from "@tanstack/react-router";
import { Bell, Bot, Calendar, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useScheduledActions } from "@/hooks/use-scheduled-actions";
import type { ScheduledAction } from "@/types/scheduled-action";

function formatNextRun(action: ScheduledAction): string {
  const dateStr = action.nextRunAt ?? action.runAt;
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();

  if (diff < 0) return "Overdue";
  if (diff < 60_000) return "< 1 min";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ActionItem({ action }: { action: ScheduledAction }) {
  return (
    <Link
      to="/automations/$id"
      params={{ id: action.id }}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
    >
      {action.kind === "agent_run" ? (
        <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      ) : (
        <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      )}
      <span className="flex-1 truncate">{action.title}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {formatNextRun(action)}
      </span>
    </Link>
  );
}

export function ScheduledActionsWidget() {
  const { data: actions, isLoading } = useScheduledActions({
    status: "active",
  });

  const upcoming = actions?.slice(0, 5);

  return (
    <Card className="flex flex-col h-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Zap className="h-5 w-5" />
          <span>Automations</span>
        </CardTitle>
        <CardDescription>Upcoming scheduled actions</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              <Clock className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : !upcoming || upcoming.length === 0 ? (
            <div className="flex flex-col items-center py-4 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">
                No active automations
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {upcoming.map((action) => (
                <ActionItem key={action.id} action={action} />
              ))}
            </div>
          )}
        </div>
        <div className="pt-4 mt-auto">
          <Link to="/automations">
            <Button variant="outline" size="sm" className="w-full">
              View All Automations
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
