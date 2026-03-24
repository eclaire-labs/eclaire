import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SkillCatalogItem } from "@/types/agent";

const SCOPE_STYLES: Record<string, { label: string; className: string }> = {
  admin: {
    label: "Admin",
    className: "border-purple-500/50 text-purple-700 dark:text-purple-400",
  },
  user: {
    label: "User",
    className: "border-blue-500/50 text-blue-700 dark:text-blue-400",
  },
  workspace: {
    label: "Workspace",
    className: "border-green-500/50 text-green-700 dark:text-green-400",
  },
};

interface SkillCardProps {
  skill: SkillCatalogItem;
  onClick: () => void;
}

export function SkillCard({ skill, onClick }: SkillCardProps) {
  const defaultScopeStyle = { label: skill.scope, className: "" };
  const scopeStyle = SCOPE_STYLES[skill.scope] ?? defaultScopeStyle;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{skill.name}</span>
          <Badge
            variant="outline"
            className={`text-[10px] ${scopeStyle.className}`}
          >
            {scopeStyle.label}
          </Badge>
          {skill.alwaysInclude && (
            <Badge variant="outline" className="text-[10px]">
              Always active
            </Badge>
          )}
        </div>
        {skill.description && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {skill.description}
          </p>
        )}
        {skill.tags.length > 0 && (
          <div className="mt-1.5 flex gap-1 flex-wrap">
            {skill.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
