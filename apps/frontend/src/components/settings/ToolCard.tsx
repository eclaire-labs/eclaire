import { ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgentCatalogItem } from "@/types/agent";

const AVAILABILITY_STYLES: Record<
  string,
  { dot: string; badge: string; label: string }
> = {
  available: { dot: "bg-green-500", badge: "", label: "" },
  setup_required: {
    dot: "bg-yellow-500",
    badge: "border-yellow-500/50 text-yellow-700 dark:text-yellow-400",
    label: "Setup Required",
  },
  disabled: {
    dot: "bg-gray-400",
    badge: "border-gray-400/50 text-gray-500",
    label: "Disabled",
  },
};

interface ToolCardProps {
  tool: AgentCatalogItem;
  onClick: () => void;
}

export function ToolCard({ tool, onClick }: ToolCardProps) {
  const status = tool.availability ?? "available";
  const defaultStyle = { dot: "bg-green-500", badge: "", label: "" };
  const style = AVAILABILITY_STYLES[status] ?? defaultStyle;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full"
    >
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Wrench className="h-4 w-4 text-muted-foreground" />
        <span
          className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${style.dot}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{tool.label ?? tool.name}</span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {tool.name}
          </Badge>
          {style.label && (
            <Badge variant="outline" className={`text-[10px] ${style.badge}`}>
              {style.label}
            </Badge>
          )}
          {tool.needsApproval && (
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        {tool.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {tool.description}
          </p>
        )}
      </div>
    </button>
  );
}
