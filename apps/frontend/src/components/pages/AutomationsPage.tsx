/**
 * Automations list page — shows all scheduled actions.
 */

import { Link } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  Calendar,
  Clock,
  MoreHorizontal,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCancelScheduledAction,
  useDeleteScheduledAction,
  useScheduledActions,
} from "@/hooks/use-scheduled-actions";
import type { ScheduledAction } from "@/types/scheduled-action";

function formatSchedule(action: ScheduledAction): string {
  if (action.triggerType === "once" && action.runAt) {
    const d = new Date(action.runAt);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  return action.cronExpression ?? "—";
}

function statusBadge(status: string) {
  const variants: Record<
    string,
    {
      variant: "default" | "secondary" | "outline" | "destructive";
      label: string;
    }
  > = {
    active: { variant: "default", label: "Active" },
    paused: { variant: "secondary", label: "Paused" },
    completed: { variant: "outline", label: "Completed" },
    cancelled: { variant: "outline", label: "Cancelled" },
  };
  const v = variants[status] ?? { variant: "outline" as const, label: status };
  return <Badge variant={v.variant}>{v.label}</Badge>;
}

function kindBadge(kind: string) {
  if (kind === "agent_run") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Bot className="h-3 w-3" />
        Agent
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Bell className="h-3 w-3" />
      Reminder
    </Badge>
  );
}

function ActionRow({ action }: { action: ScheduledAction }) {
  const cancelMutation = useCancelScheduledAction();
  const deleteMutation = useDeleteScheduledAction();

  return (
    <TableRow>
      <TableCell>
        <Link
          to="/automations/$id"
          params={{ id: action.id }}
          className="font-medium hover:underline"
        >
          {action.title}
        </Link>
      </TableCell>
      <TableCell>{kindBadge(action.kind)}</TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatSchedule(action)}
      </TableCell>
      <TableCell>{statusBadge(action.status)}</TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {action.runCount}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {action.lastRunAt
          ? new Date(action.lastRunAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "—"}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {action.status === "active" && (
              <DropdownMenuItem
                onClick={() => cancelMutation.mutate(action.id)}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => deleteMutation.mutate(action.id)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

export default function AutomationsPage() {
  const { data: actions, isLoading } = useScheduledActions();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Zap className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Automations</h1>
            <p className="text-sm text-muted-foreground">
              Scheduled reminders, recurring agent tasks, and timed actions.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <Clock className="h-5 w-5 animate-spin mr-2" />
          Loading...
        </div>
      ) : !actions || actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-medium mb-1">No automations yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Ask the AI assistant to set a reminder or schedule a recurring task.
            Try "Remind me to go to school in 5 minutes" or "Every morning,
            summarize my overdue tasks."
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Runs</TableHead>
              <TableHead>Last Run</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.map((action) => (
              <ActionRow key={action.id} action={action} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
