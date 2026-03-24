import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSkillDetail } from "@/lib/api-agents";
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

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  admin: "Available to all users in this instance.",
  user: "Personal skill, available only to you.",
  workspace: "Available within the current workspace.",
};

interface SkillDetailSheetProps {
  skill: SkillCatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SkillDetailSheet({
  skill,
  open,
  onOpenChange,
}: SkillDetailSheetProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const skillName = skill?.name ?? null;

  useEffect(() => {
    if (!skillName || !open) {
      setContent(null);
      return;
    }

    setLoadingContent(true);
    getSkillDetail(skillName)
      .then((detail) => setContent(detail.content))
      .catch(() => setContent(null))
      .finally(() => setLoadingContent(false));
  }, [skillName, open]);

  if (!skill) return null;

  const defaultScopeStyle = { label: skill.scope, className: "" };
  const scopeStyle = SCOPE_STYLES[skill.scope] ?? defaultScopeStyle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle>{skill.name}</DialogTitle>
              <DialogDescription>{skill.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={scopeStyle.className}>
              {scopeStyle.label}
            </Badge>
            {skill.alwaysInclude && (
              <Badge variant="outline">Always active</Badge>
            )}
          </div>

          {/* Scope description */}
          <p className="text-sm text-muted-foreground">
            {SCOPE_DESCRIPTIONS[skill.scope] ?? ""}
          </p>

          {/* Tags */}
          {skill.tags.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2">Tags</h4>
              <div className="flex gap-1.5 flex-wrap">
                {skill.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <Separator />
          <div>
            <h4 className="text-sm font-medium mb-2">Skill Content</h4>
            {loadingContent ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : content ? (
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-muted rounded-md p-3 max-h-[400px] overflow-y-auto">
                {content}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No content available.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
