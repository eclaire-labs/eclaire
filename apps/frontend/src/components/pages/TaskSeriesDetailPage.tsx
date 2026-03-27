import { useState } from "react";
import { Link, useParams, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bot,
  Calendar,
  Clock,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  User,
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
import { DeleteConfirmDialog } from "@/components/detail-page/DeleteConfirmDialog";
import {
  useTaskSeriesDetail,
  usePauseTaskSeries,
  useResumeTaskSeries,
  useDeleteTaskSeries,
} from "@/hooks/use-task-series";
import { useTasks } from "@/hooks/use-tasks";
import { formatDate } from "@/lib/date-utils";
import { getStatusIcon } from "./tasks/task-utils";

function formatCronReadable(cron: string): string {
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

    if (dow === "*") return `Every day ${time}`.trim();
    if (dow === "1-5") return `Every weekday ${time}`.trim();
    if (dow === "1") return `Every Monday ${time}`.trim();
    if (dow === "0") return `Every Sunday ${time}`.trim();
  }
  return cron;
}

export default function TaskSeriesDetailPage() {
  const { id } = useParams({ from: "/_authenticated/task-series/$id" });
  const router = useRouter();
  const { data: series, isLoading } = useTaskSeriesDetail(id);
  const pauseMutation = usePauseTaskSeries();
  const resumeMutation = useResumeTaskSeries();
  const deleteMutation = useDeleteTaskSeries();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch spawned task occurrences
  const { tasks: occurrences, isLoading: isLoadingOccurrences } = useTasks({
    sortBy: "createdAt",
    sortDir: "desc",
    limit: 20,
  });

  // Filter to only tasks from this series (client-side since we don't have a
  // server-side taskSeriesId filter on findTasks yet)
  const seriesOccurrences = occurrences.filter((t) => t.taskSeriesId === id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading...
      </div>
    );
  }

  if (!series) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        Task series not found.
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link
        to="/task-series"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Task Series
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">{series.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={series.status === "active" ? "default" : "secondary"}
              >
                {series.status}
              </Badge>
              <Badge variant="outline">
                {series.executionPolicy === "assign_and_run"
                  ? "Auto-run"
                  : "Assign only"}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {series.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => pauseMutation.mutate(series.id)}
              disabled={pauseMutation.isPending}
            >
              <Pause className="mr-1.5 h-3.5 w-3.5" />
              Pause
            </Button>
          )}
          {series.status === "paused" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resumeMutation.mutate(series.id)}
              disabled={resumeMutation.isPending}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Resume
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Details Grid */}
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
              <span className="text-muted-foreground">Pattern</span>
              <span>{formatCronReadable(series.cronExpression)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cron</span>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {series.cronExpression}
              </code>
            </div>
            {series.timezone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timezone</span>
                <span>{series.timezone}</span>
              </div>
            )}
            {series.nextOccurrenceAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next occurrence</span>
                <span>{formatDate(series.nextOccurrenceAt)}</span>
              </div>
            )}
            {series.lastOccurrenceAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last occurrence</span>
                <span>{formatDate(series.lastOccurrenceAt)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Occurrences</span>
              <span>
                {series.occurrenceCount}
                {series.maxOccurrences ? ` / ${series.maxOccurrences}` : ""}
              </span>
            </div>
            {series.startAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start</span>
                <span>{formatDate(series.startAt)}</span>
              </div>
            )}
            {series.endAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">End</span>
                <span>{formatDate(series.endAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Execution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Policy</span>
              <span>
                {series.executionPolicy === "assign_and_run"
                  ? "Assign and auto-run"
                  : "Assign only"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Assignee</span>
              <span className="flex items-center gap-1">
                {series.defaultAssigneeActorId ? (
                  <>
                    <Bot className="h-3 w-3" />
                    {series.defaultAssigneeActorId}
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3" />
                    Unassigned
                  </>
                )}
              </span>
            </div>
            {series.description && (
              <div>
                <span className="text-muted-foreground block mb-1">
                  Description
                </span>
                <p className="bg-muted rounded-md p-2 text-xs whitespace-pre-wrap">
                  {series.description}
                </p>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(series.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Occurrences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Recent Occurrences
          </CardTitle>
          <CardDescription>Tasks created by this series.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingOccurrences ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading...
            </div>
          ) : seriesOccurrences.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No occurrences yet.
            </p>
          ) : (
            <div className="space-y-1">
              {seriesOccurrences.map((task) => (
                <Link
                  key={task.id}
                  to="/tasks/$id"
                  params={{ id: task.id }}
                  className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted transition-colors"
                >
                  {getStatusIcon(task.status)}
                  <span className="text-sm flex-1 truncate">{task.title}</span>
                  <Badge variant="outline" className="text-xs">
                    {task.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(task.createdAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        label="Task Series"
        onConfirm={() => {
          deleteMutation.mutate(series.id, {
            onSuccess: () => {
              setDeleteDialogOpen(false);
              router.navigate({ to: "/task-series" });
            },
          });
        }}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
