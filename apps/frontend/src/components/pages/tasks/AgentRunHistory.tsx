import { useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MarkdownDisplayWithAssets } from "@/components/markdown-display-with-assets";
import { useAgentRuns, type AgentRun } from "@/hooks/use-agent-runs";

function formatDuration(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RunStatusIcon({ status }: { status: AgentRun["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "queued":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "cancelled":
      return <XCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

function RunStatusBadge({ status }: { status: AgentRun["status"] }) {
  const variants: Record<AgentRun["status"], string> = {
    completed:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    queued: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  };
  return (
    <Badge variant="outline" className={`text-xs ${variants[status]}`}>
      {status}
    </Badge>
  );
}

function AgentRunItem({ run }: { run: AgentRun }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = run.output || run.error;

  return (
    <div className="border rounded-md">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => hasOutput && setExpanded(!expanded)}
        disabled={!hasOutput}
      >
        <RunStatusIcon status={run.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {run.prompt
                ? run.prompt.length > 60
                  ? `${run.prompt.slice(0, 60)}...`
                  : run.prompt
                : "Agent run"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{formatRelativeTime(run.createdAt)}</span>
            {run.durationMs !== null && (
              <>
                <span>&middot;</span>
                <span>{formatDuration(run.durationMs)}</span>
              </>
            )}
          </div>
        </div>
        <RunStatusBadge status={run.status} />
        {hasOutput && (
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {expanded && hasOutput && (
        <div className="px-3 pb-3 border-t">
          {run.error ? (
            <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20 text-sm text-red-700 dark:text-red-400">
              <div className="flex items-center gap-1.5 font-medium mb-1">
                <AlertCircle className="h-3.5 w-3.5" />
                Error
              </div>
              {run.error}
            </div>
          ) : run.output ? (
            <div className="mt-2 text-sm prose prose-sm dark:prose-invert max-w-none">
              <MarkdownDisplayWithAssets
                content={
                  run.output.length > 2000
                    ? `${run.output.slice(0, 2000)}...\n\n*Output truncated*`
                    : run.output
                }
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface AgentRunHistoryProps {
  taskId: string;
}

export function AgentRunHistory({ taskId }: AgentRunHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { runs, isLoading } = useAgentRuns(taskId, { enabled: isOpen });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 px-0 hover:bg-transparent"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <Bot className="h-4 w-4" />
          <span className="font-semibold text-base">Agent Activity</span>
          {runs.length > 0 && (
            <Badge variant="secondary" className="text-xs ml-1">
              {runs.length}
            </Badge>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 mt-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading agent runs...
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No agent runs yet.
            </p>
          ) : (
            runs.map((run) => <AgentRunItem key={run.id} run={run} />)
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
