import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentCatalog } from "@/lib/api-agents";
import type { SkillCatalogItem } from "@/types/agent";

const SCOPE_LABELS: Record<string, string> = {
  admin: "Admin",
  user: "User",
  workspace: "Workspace",
};

export default function SkillsSettings() {
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAgentCatalog()
      .then((catalog) => setSkills(catalog.skills))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Skills
          </CardTitle>
          <CardDescription>
            Skills available to agents in this instance. Agents select which
            skills to use in their configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No skills available.
            </p>
          ) : (
            <div className="space-y-3">
              {skills.map((skill) => (
                <div
                  key={skill.name}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Sparkles className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{skill.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {SCOPE_LABELS[skill.scope] ?? skill.scope}
                      </Badge>
                      {skill.alwaysInclude && (
                        <Badge variant="outline" className="text-[10px]">
                          Always active
                        </Badge>
                      )}
                    </div>
                    {skill.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {skill.description}
                      </p>
                    )}
                    {skill.tags.length > 0 && (
                      <div className="mt-1.5 flex gap-1 flex-wrap">
                        {skill.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-[10px] text-muted-foreground"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Adding Custom Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Skills are loaded from <code>SKILL.md</code> files. To add custom
            skills, create a directory with a <code>SKILL.md</code> file in one
            of these locations:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc list-inside">
            <li>
              <code>config/ai/skills/&lt;name&gt;/SKILL.md</code> — admin scope
              (available to all users)
            </li>
            <li>
              <code>~/.agents/skills/&lt;name&gt;/SKILL.md</code> — user scope
              (personal skills)
            </li>
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">
            Each <code>SKILL.md</code> requires YAML frontmatter with at minimum
            a <code>description</code> field. Optional fields include{" "}
            <code>tags</code> and <code>alwaysInclude</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
