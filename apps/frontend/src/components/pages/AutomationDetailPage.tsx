/**
 * Automation detail page — shows a single scheduled action with execution history.
 */

import { Link, useParams, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  useScheduledAction,
  useScheduledActionExecutions,
} from "@/hooks/use-scheduled-actions";
import type { ScheduledActionExecution } from "@/types/scheduled-action";

function executionStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function ExecutionRow({ execution }: { execution: ScheduledActionExecution }) {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          {executionStatusIcon(execution.status)}
          <span className="capitalize">{execution.status}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatDate(execution.scheduledFor)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatDate(execution.startedAt)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
        {execution.output ?? execution.error ?? "—"}
      </TableCell>
    </TableRow>
  );
}

export default function AutomationDetailPage() {
  const { id } = useParams({ from: "/_authenticated/automations/$id" });
  const router = useRouter();
  const { data: action, isLoading } = useScheduledAction(id);
  const { data: executions } = useScheduledActionExecutions(id);
  const cancelMutation = useCancelScheduledAction();
  const deleteMutation = useDeleteScheduledAction();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!action) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        Scheduled action not found.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back link */}
      <Link
        to="/automations"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Automations
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          {action.kind === "agent_run" ? (
            <Bot className="h-6 w-6 text-primary" />
          ) : (
            <Bell className="h-6 w-6 text-primary" />
          )}
          <div>
            <h1 className="text-2xl font-semibold">{action.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={action.status === "active" ? "default" : "secondary"}
              >
                {action.status}
              </Badge>
              <Badge variant="outline">
                {action.kind === "agent_run" ? "Agent Run" : "Reminder"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {action.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelMutation.mutate(action.id)}
            >
              Cancel
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              deleteMutation.mutate(action.id);
              router.navigate({ to: "/automations" });
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span>
                {action.triggerType === "once" ? "One-time" : "Recurring"}
              </span>
            </div>
            {action.triggerType === "once" && action.runAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Run at</span>
                <span>{formatDate(action.runAt)}</span>
              </div>
            )}
            {action.cronExpression && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cron</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {action.cronExpression}
                </code>
              </div>
            )}
            {action.nextRunAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next run</span>
                <span>{formatDate(action.nextRunAt)}</span>
              </div>
            )}
            {action.lastRunAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last run</span>
                <span>{formatDate(action.lastRunAt)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Run count</span>
              <span>
                {action.runCount}
                {action.maxRuns ? ` / ${action.maxRuns}` : ""}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground block mb-1">
                {action.kind === "agent_run" ? "Prompt" : "Message"}
              </span>
              <p className="bg-muted rounded-md p-2 text-xs whitespace-pre-wrap">
                {action.prompt}
              </p>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(action.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Execution History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Execution History
          </CardTitle>
          <CardDescription>Past runs of this scheduled action.</CardDescription>
        </CardHeader>
        <CardContent>
          {!executions || executions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No executions yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled For</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Output</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((exec) => (
                  <ExecutionRow key={exec.id} execution={exec} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
