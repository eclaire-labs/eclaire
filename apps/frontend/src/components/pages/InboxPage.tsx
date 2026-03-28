import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Inbox,
  Loader2,
  RotateCcw,
  ThumbsUp,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/date-utils";
import { useSSEConnectionStatus } from "@/providers/ProcessingEventsProvider";
import type { InboxResponse, InboxTask } from "@/types/task";

function useInbox() {
  const { isConnected } = useSSEConnectionStatus();
  return useQuery<InboxResponse>({
    queryKey: ["inbox"],
    queryFn: async () => {
      const res = await apiFetch("/api/tasks/inbox");
      if (!res.ok) throw new Error("Failed to fetch inbox");
      return res.json();
    },
    // Only poll when SSE is disconnected; SSE invalidation handles the live case
    refetchInterval: isConnected ? false : 30_000,
  });
}

function useTaskAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      action,
      body,
    }: {
      taskId: string;
      action: string;
      body?: Record<string, unknown>;
    }) => {
      const res = await apiFetch(`/api/tasks/${taskId}/${action}`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

function InboxSection({
  title,
  icon: Icon,
  items,
  emptyText,
  actions,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: InboxTask[];
  emptyText: string;
  actions: (task: InboxTask) => React.ReactNode;
}) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <Badge variant="secondary" className="text-xs">
          {items.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {items.map((task) => (
          <Card
            key={task.taskId}
            className="hover:bg-muted/50 transition-colors"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Link
                    to="/tasks/$id"
                    params={{ id: task.taskId }}
                    className="text-sm font-medium hover:underline"
                  >
                    {task.title}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {task.reasonText}
                  </p>
                  {task.dueDate && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Due {formatDate(task.dueDate)}
                    </p>
                  )}
                  {task.latestErrorSummary && (
                    <p className="text-xs text-destructive mt-1 line-clamp-2">
                      {task.latestErrorSummary}
                    </p>
                  )}
                  {task.latestResultSummary &&
                    task.attentionStatus === "needs_review" && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {task.latestResultSummary}
                      </p>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {actions(task)}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function InboxPage() {
  const { data: inbox, isLoading, error } = useInbox();
  const action = useTaskAction();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-destructive">
        <AlertCircle className="h-5 w-5 mr-2" />
        Failed to load inbox
      </div>
    );
  }

  if (!inbox || inbox.totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold">Inbox clear</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Nothing needs your attention right now.
        </p>
        <Link to="/tasks">
          <Button variant="outline" className="mt-4">
            Go to Tasks
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tasks that need your attention ({inbox.totalCount})
        </p>
      </div>

      <InboxSection
        title="Needs Review"
        icon={ThumbsUp}
        items={inbox.sections.needsReview}
        emptyText="No items need review"
        actions={(task) => (
          <>
            <Button
              size="sm"
              variant="default"
              onClick={() =>
                action.mutate({ taskId: task.taskId, action: "approve" })
              }
              disabled={action.isPending}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                action.mutate({
                  taskId: task.taskId,
                  action: "request-changes",
                })
              }
              disabled={action.isPending}
            >
              Changes
            </Button>
          </>
        )}
      />

      <InboxSection
        title="Waiting on You"
        icon={HelpCircle}
        items={inbox.sections.waitingOnYou}
        emptyText="Nothing waiting on you"
        actions={(task) => (
          <Link to="/tasks/$id" params={{ id: task.taskId }}>
            <Button size="sm" variant="outline">
              Reply
            </Button>
          </Link>
        )}
      />

      <InboxSection
        title="Failed"
        icon={XCircle}
        items={inbox.sections.failed}
        emptyText="No failures"
        actions={(task) => (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                action.mutate({ taskId: task.taskId, action: "retry" })
              }
              disabled={action.isPending}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Retry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                action.mutate({ taskId: task.taskId, action: "cancel" })
              }
              disabled={action.isPending}
            >
              Cancel
            </Button>
          </>
        )}
      />

      <InboxSection
        title="Needs Triage"
        icon={Inbox}
        items={inbox.sections.needsTriage}
        emptyText="No items to triage"
        actions={(task) => (
          <Link to="/tasks/$id" params={{ id: task.taskId }}>
            <Button size="sm" variant="outline">
              Open
            </Button>
          </Link>
        )}
      />

      <InboxSection
        title="Urgent"
        icon={Clock}
        items={inbox.sections.urgent}
        emptyText="Nothing urgent"
        actions={(task) => (
          <Link to="/tasks/$id" params={{ id: task.taskId }}>
            <Button size="sm" variant="outline">
              Open
            </Button>
          </Link>
        )}
      />
    </div>
  );
}
