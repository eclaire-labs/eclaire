import type { AgentExecutionStatus } from "@/hooks/use-session-status";

const colors: Record<AgentExecutionStatus, string> = {
  running: "bg-amber-400",
  completed: "bg-green-500",
  error: "bg-red-500",
};

export function AgentStatusDot({ status }: { status: AgentExecutionStatus }) {
  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
      {status === "running" && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${colors.running} opacity-75 animate-ping`}
        />
      )}
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${colors[status]}`}
      />
    </span>
  );
}
