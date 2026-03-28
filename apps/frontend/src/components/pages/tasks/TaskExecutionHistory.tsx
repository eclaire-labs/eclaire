import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTaskOccurrences } from "@/hooks/use-task-executions";
import type { TaskOccurrence } from "@/types/task";
import {
  AlertCircle,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
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

interface StatusConfigEntry {
  icon: React.ComponentType<{ className?: string }>;
  variant: "default" | "secondary" | "destructive" | "outline";
  label: string;
}

const statusConfig: { [key: string]: StatusConfigEntry } = {
  completed: {
    icon: CheckCircle2,
    variant: "default",
    label: "Completed",
  },
  failed: {
    icon: AlertCircle,
    variant: "destructive",
    label: "Failed",
  },
  running: { icon: Loader2, variant: "secondary", label: "Running" },
  queued: { icon: Clock, variant: "outline", label: "Queued" },
  scheduled: { icon: Clock, variant: "outline", label: "Scheduled" },
  cancelled: { icon: XCircle, variant: "outline", label: "Cancelled" },
  awaiting_input: {
    icon: Clock,
    variant: "secondary",
    label: "Awaiting Input",
  },
  awaiting_review: {
    icon: Clock,
    variant: "secondary",
    label: "Awaiting Review",
  },
  idle: { icon: Clock, variant: "outline", label: "Idle" },
};

const kindIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  manual_run: Play,
  scheduled_run: Clock,
  recurring_run: RefreshCw,
  reminder: Bell,
  review_run: Bot,
};

const fallbackConfig: StatusConfigEntry = {
  icon: CheckCircle2,
  variant: "default",
  label: "Completed",
};

function OccurrenceRow({
  occurrence,
  fullWidth,
}: {
  occurrence: TaskOccurrence;
  fullWidth?: boolean;
}) {
  const config: StatusConfigEntry =
    statusConfig[occurrence.executionStatus] ?? fallbackConfig;
  const StatusIcon = config.icon;
  const KindIcon = kindIcons[occurrence.kind] ?? Play;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0 py-2 px-1">
      <button
        type="button"
        className="flex items-center gap-2 cursor-pointer w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon
          className={`h-3.5 w-3.5 shrink-0 ${
            occurrence.executionStatus === "running" ? "animate-spin" : ""
          } ${
            occurrence.executionStatus === "completed"
              ? "text-green-500"
              : occurrence.executionStatus === "failed"
                ? "text-red-500"
                : "text-muted-foreground"
          }`}
        />
        <KindIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground flex-1">
          {formatRelativeTime(occurrence.startedAt ?? occurrence.createdAt)}
        </span>
        {occurrence.durationMs !== null && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(occurrence.durationMs)}
          </span>
        )}
        <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
          {config.label}
        </Badge>
      </button>
      {expanded && (
        <div className="mt-1.5 ml-5.5 text-xs">
          {occurrence.errorBody && (
            <p className="text-red-500 break-words">{occurrence.errorBody}</p>
          )}
          {occurrence.resultSummary && (
            <p
              className={`text-muted-foreground break-words ${fullWidth ? "" : "line-clamp-3"}`}
            >
              {occurrence.resultSummary}
            </p>
          )}
          {!occurrence.errorBody && !occurrence.resultSummary && (
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
  autoOpen?: boolean;
  /** When true, renders without collapsible toggle and uses wider layout */
  fullWidth?: boolean;
}

export function TaskExecutionHistory({
  taskId,
  isRecurring,
  autoOpen,
  fullWidth,
}: TaskExecutionHistoryProps) {
  const [isOpen, setIsOpen] = useState(
    fullWidth || isRecurring || autoOpen || false,
  );
  const {
    occurrences,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useTaskOccurrences(taskId, {
    enabled: fullWidth || isRecurring || autoOpen || isOpen,
    limit: 10,
  });

  const content = isLoading ? (
    <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading...
    </div>
  ) : occurrences.length === 0 ? (
    <p className="text-sm text-muted-foreground py-4">No executions yet</p>
  ) : (
    <>
      <div className="border rounded-md">
        {occurrences.map((occ) => (
          <OccurrenceRow key={occ.id} occurrence={occ} fullWidth={fullWidth} />
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
  );

  if (fullWidth) {
    return <div>{content}</div>;
  }

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

      {isOpen && <div className="mt-2">{content}</div>}
    </div>
  );
}
