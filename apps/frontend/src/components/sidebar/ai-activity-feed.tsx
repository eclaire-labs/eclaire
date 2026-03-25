import { useSessionStatuses } from "@/hooks/use-session-status";
import type { Agent } from "@/types/agent";

const statusColors: Record<string, string> = {
  running: "bg-amber-400",
  error: "bg-red-500",
  unread: "bg-green-500",
};

const statusVerbs: Record<string, string> = {
  running: "Running",
  error: "Error",
  unread: "Completed",
};

interface AiActivityFeedProps {
  agents: Agent[];
  onSelectActivity: (sessionId: string) => void;
}

export function AiActivityFeed({
  agents,
  onSelectActivity,
}: AiActivityFeedProps) {
  const { data } = useSessionStatuses();

  if (!data?.items || data.items.length === 0) return null;

  const agentMap = new Map(agents.map((a) => [a.id, a.name]));

  // Derive display entries from session statuses
  const entries = data.items
    .map((session) => {
      let status: string | null = null;
      if (session.executionStatus === "running") status = "running";
      else if (session.executionStatus === "error") status = "error";
      else if (session.hasUnreadResponse) status = "unread";

      if (!status) return null;

      return {
        id: session.id,
        agentName: agentMap.get(session.agentActorId) ?? "Agent",
        status,
      };
    })
    .filter(Boolean) as {
    id: string;
    agentName: string;
    status: string;
  }[];

  if (entries.length === 0) return null;

  return (
    <div>
      <div className="h-px bg-border my-2" />
      <div className="px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
          Activity
        </span>
      </div>
      <ul className="space-y-0.5">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => onSelectActivity(entry.id)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-[hsl(var(--hover-bg))] text-left transition-colors"
            >
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${statusColors[entry.status]}`}
              />
              <span className="truncate">
                <span className="font-medium">{entry.agentName}</span>
                {" \u00B7 "}
                {statusVerbs[entry.status]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
