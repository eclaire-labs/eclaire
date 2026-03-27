/**
 * Automations list for the AI sidebar.
 * Shows upcoming scheduled actions and recent executions.
 */

import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Bot, Calendar, Clock } from "lucide-react";
import { useScheduledActions } from "@/hooks/use-scheduled-actions";
import type { ScheduledAction } from "@/types/scheduled-action";

function kindIcon(kind: string) {
  return kind === "agent_run" ? (
    <Bot className="h-3.5 w-3.5 shrink-0" />
  ) : (
    <Bell className="h-3.5 w-3.5 shrink-0" />
  );
}

function statusDot(status: string) {
  const colors: Record<string, string> = {
    active: "bg-green-500",
    paused: "bg-yellow-400",
    completed: "bg-muted-foreground/40",
    cancelled: "bg-muted-foreground/20",
  };
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full shrink-0 ${colors[status] ?? "bg-muted-foreground/40"}`}
    />
  );
}

function formatSchedule(action: ScheduledAction): string {
  if (action.triggerType === "once" && action.runAt) {
    const d = new Date(action.runAt);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    if (isToday) return `Today at ${time}`;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString())
      return `Tomorrow at ${time}`;
    const dateStr = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${dateStr} at ${time}`;
  }
  if (action.cronExpression) {
    return describeCron(action.cronExpression);
  }
  return "Scheduled";
}

function describeCron(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const [min, hour, , , dow] = parts;

  const timeStr =
    hour !== "*" && min !== "*"
      ? new Date(2000, 0, 1, Number(hour), Number(min)).toLocaleTimeString(
          "en-US",
          { hour: "numeric", minute: "2-digit", hour12: true },
        )
      : null;

  if (dow === "*" && timeStr) return `Daily at ${timeStr}`;
  if (dow === "1-5" && timeStr) return `Weekdays at ${timeStr}`;
  if (dow === "1" && timeStr) return `Mondays at ${timeStr}`;
  if (hour === "*" && min === "0") return "Every hour";
  if (timeStr) return `${cron} (${timeStr})`;
  return cron;
}

function AutomationItem({ action }: { action: ScheduledAction }) {
  return (
    <Link
      to="/automations/$id"
      params={{ id: action.id }}
      className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-[hsl(var(--hover-bg))] text-left transition-colors"
    >
      {statusDot(action.status)}
      {kindIcon(action.kind)}
      <div className="flex-1 min-w-0">
        <div className="truncate text-foreground text-sm">{action.title}</div>
        <div className="truncate text-xs text-muted-foreground/70">
          {formatSchedule(action)}
        </div>
      </div>
    </Link>
  );
}

export function AiAutomationsList() {
  const { data: actions, isLoading } = useScheduledActions();

  const active = useMemo(
    () =>
      actions?.filter((a) => a.status === "active" || a.status === "paused"),
    [actions],
  );
  const recent = useMemo(
    () =>
      actions?.filter(
        (a) => a.status === "completed" || a.status === "cancelled",
      ),
    [actions],
  );

  if (isLoading) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground/50 text-center">
        Loading...
      </div>
    );
  }

  if (!actions || actions.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground/60">
          No scheduled actions yet.
        </p>
        <p className="text-xs text-muted-foreground/40 mt-1">
          Ask the assistant to set a reminder or schedule a recurring task.
        </p>
      </div>
    );
  }

  return (
    <div className="px-1">
      {active && active.length > 0 && (
        <div>
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Calendar className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
              Upcoming
            </span>
          </div>
          <div className="space-y-0.5">
            {active.map((a) => (
              <AutomationItem key={a.id} action={a} />
            ))}
          </div>
        </div>
      )}

      {recent && recent.length > 0 && (
        <div className="mt-2">
          <div className="h-px bg-border my-2" />
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Clock className="h-3 w-3 text-muted-foreground/50" />
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">
              Recent
            </span>
          </div>
          <div className="space-y-0.5">
            {recent.slice(0, 5).map((a) => (
              <AutomationItem key={a.id} action={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
