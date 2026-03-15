import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTaskExecutions } from "@/hooks/use-task-executions";
import type { TaskExecution } from "@/types/task";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  SkipForward,
} from "lucide-react";
import { useState } from "react";

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60000)}m`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

const statusConfig = {
  completed: {
    icon: CheckCircle2,
    variant: "success" as const,
    label: "Completed",
  },
  failed: {
    icon: AlertCircle,
    variant: "destructive" as const,
    label: "Failed",
  },
  running: { icon: Loader2, variant: "secondary" as const, label: "Running" },
  skipped: { icon: SkipForward, variant: "outline" as const, label: "Skipped" },
};

function ExecutionRow({ execution }: { execution: TaskExecution }) {
  const config = statusConfig[execution.status] || statusConfig.completed;
  const Icon = config.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0 py-2 px-1">
      <button
        type="button"
        className="flex items-center gap-2 cursor-pointer w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon
          className={`h-3.5 w-3.5 shrink-0 ${
            execution.status === "running" ? "animate-spin" : ""
          } ${
            execution.status === "completed"
              ? "text-green-500"
              : execution.status === "failed"
                ? "text-red-500"
                : "text-muted-foreground"
          }`}
        />
        <span className="text-xs text-muted-foreground flex-1">
          {formatRelativeTime(execution.startedAt)}
        </span>
        {execution.durationMs !== null && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(execution.durationMs)}
          </span>
        )}
        <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
          {config.label}
        </Badge>
      </button>
      {expanded && (
        <div className="mt-1.5 ml-5.5 text-xs">
          {execution.error && (
            <p className="text-red-500 break-words">{execution.error}</p>
          )}
          {execution.resultSummary && (
            <p className="text-muted-foreground break-words line-clamp-3">
              {execution.resultSummary}
            </p>
          )}
          {!execution.error && !execution.resultSummary && (
            <p className="text-muted-foreground italic">No details available</p>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskExecutionHistoryProps {
  taskId: string;
  isRecurring?: boolean;
}

export function TaskExecutionHistory({
  taskId,
  isRecurring,
}: TaskExecutionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    executions,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useTaskExecutions(taskId, { enabled: isOpen, limit: 10 });

  if (!isRecurring && !isOpen) return null;

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-medium w-full text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`}
        />
        Execution History
      </button>

      {isOpen && (
        <div className="mt-2">
          {isLoading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : executions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No executions yet
            </p>
          ) : (
            <>
              <div className="border rounded-md">
                {executions.map((exec) => (
                  <ExecutionRow key={exec.id} execution={exec} />
                ))}
              </div>
              {hasNextPage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-1 text-xs"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  Load more
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
