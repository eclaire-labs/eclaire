import { Link } from "@tanstack/react-router";
import { Loader2, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import {
  useTaskSeriesList,
  usePauseTaskSeries,
  useResumeTaskSeries,
  useDeleteTaskSeries,
  type TaskSeriesItem,
} from "@/hooks/use-task-series";

function formatCron(cron: string): string {
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const min = parts[0] ?? "*";
  const hour = parts[1] ?? "*";
  const dom = parts[2] ?? "*";
  const mon = parts[3] ?? "*";
  const dow = parts[4] ?? "*";

  if (dom === "*" && mon === "*") {
    const time =
      min !== "*" && hour !== "*" ? `at ${hour}:${min.padStart(2, "0")}` : "";

    if (dow === "*") return `Daily ${time}`.trim();
    if (dow === "1-5") return `Weekdays ${time}`.trim();
    if (dow === "1") return `Mondays ${time}`.trim();
    if (dow === "0") return `Sundays ${time}`.trim();
  }
  return cron;
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

function StatusBadge({ status }: { status: TaskSeriesItem["status"] }) {
  const variants: Record<string, string> = {
    active:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    paused:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500",
  };
  return (
    <Badge variant="outline" className={`text-xs ${variants[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

export default function TaskSeriesListPage() {
  const { data, isLoading } = useTaskSeriesList();
  const pauseMutation = usePauseTaskSeries();
  const resumeMutation = useResumeTaskSeries();
  const deleteMutation = useDeleteTaskSeries();
  const [deleteTarget, setDeleteTarget] = useState<TaskSeriesItem | null>(null);

  const series = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Task Series</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Recurring task definitions
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading...
        </div>
      ) : series.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <RefreshCw className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No task series</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create recurring tasks via the AI agent using "every Monday..." or
            similar phrases.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Schedule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Policy</TableHead>
              <TableHead className="text-right">Occurrences</TableHead>
              <TableHead>Next</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link
                    to="/task-series/$id"
                    params={{ id: s.id }}
                    className="font-medium hover:underline"
                  >
                    {s.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {formatCron(s.cronExpression)}
                  </code>
                </TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {s.executionPolicy === "assign_and_run"
                    ? "Auto-run"
                    : "Assign only"}
                </TableCell>
                <TableCell className="text-right text-sm">
                  {s.occurrenceCount}
                  {s.maxOccurrences ? ` / ${s.maxOccurrences}` : ""}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDate(s.nextOccurrenceAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {s.status === "active" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Pause"
                        onClick={() => pauseMutation.mutate(s.id)}
                        disabled={pauseMutation.isPending}
                      >
                        <Pause className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {s.status === "paused" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Resume"
                        onClick={() => resumeMutation.mutate(s.id)}
                        disabled={resumeMutation.isPending}
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      title="Delete"
                      onClick={() => setDeleteTarget(s)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        label="Task Series"
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            });
          }
        }}
        isDeleting={deleteMutation.isPending}
      >
        {deleteTarget && (
          <div className="my-4 flex items-start gap-3 p-3 border rounded-md bg-muted/50">
            <RefreshCw className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words line-clamp-2 leading-tight">
                {deleteTarget.title}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {deleteTarget.occurrenceCount} occurrences created
              </p>
            </div>
          </div>
        )}
      </DeleteConfirmDialog>
    </div>
  );
}
