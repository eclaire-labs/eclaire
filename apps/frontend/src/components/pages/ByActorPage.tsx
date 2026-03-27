import { Link } from "@tanstack/react-router";
import { Bot, Loader2, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useTasksByActor,
  type ActorTaskSummary,
} from "@/hooks/use-tasks-by-actor";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500",
  "in-progress": "bg-amber-500",
  blocked: "bg-red-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-400",
  backlog: "bg-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  "in-progress": "In Progress",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
  backlog: "Backlog",
};

function getCount(counts: Record<string, number>, key: string): number {
  return counts[key] ?? 0;
}

function ActorCard({ actor }: { actor: ActorTaskSummary }) {
  const displayName =
    actor.displayName || (actor.actorId ? actor.actorId : "Unassigned");
  const isAgent = actor.kind === "agent";

  const active =
    getCount(actor.counts, "open") +
    getCount(actor.counts, "in-progress") +
    getCount(actor.counts, "blocked");
  const completed = getCount(actor.counts, "completed");

  return (
    <Link to="/tasks">
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {isAgent ? (
              <Bot className="h-5 w-5 text-purple-500" />
            ) : (
              <User className="h-5 w-5 text-blue-500" />
            )}
            <span className="truncate">{displayName}</span>
            <Badge variant="outline" className="ml-auto text-xs shrink-0">
              {isAgent ? "Agent" : "Human"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Summary stats */}
          <div className="flex items-center gap-4 mb-3 text-sm">
            <div>
              <span className="text-2xl font-bold">{active}</span>
              <span className="text-muted-foreground ml-1">active</span>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium">{completed}</span> completed
            </div>
            <div className="text-muted-foreground ml-auto">
              <span className="font-medium">{actor.total}</span> total
            </div>
          </div>

          {/* Status breakdown */}
          <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-muted">
            {Object.entries(actor.counts)
              .filter(([, c]) => c > 0)
              .sort(([a], [b]) => {
                const order = [
                  "in-progress",
                  "open",
                  "blocked",
                  "backlog",
                  "completed",
                  "cancelled",
                ];
                return order.indexOf(a) - order.indexOf(b);
              })
              .map(([status, cnt]) => (
                <div
                  key={status}
                  className={`${STATUS_COLORS[status] ?? "bg-gray-300"} transition-all`}
                  style={{ width: `${(cnt / actor.total) * 100}%` }}
                  title={`${STATUS_LABELS[status] ?? status}: ${cnt}`}
                />
              ))}
          </div>

          {/* Status legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {Object.entries(actor.counts)
              .filter(([, c]) => c > 0)
              .map(([status, cnt]) => (
                <span
                  key={status}
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${STATUS_COLORS[status] ?? "bg-gray-300"}`}
                  />
                  {STATUS_LABELS[status] ?? status} {cnt}
                </span>
              ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ByActorPage() {
  const { data, isLoading } = useTasksByActor();
  const actors = data?.actors ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">By Actor</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Task workload across people and agents
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading...
        </div>
      ) : actors.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No tasks assigned yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {actors.map((actor) => (
            <ActorCard key={actor.actorId ?? "unassigned"} actor={actor} />
          ))}
        </div>
      )}
    </div>
  );
}
