import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAgentCatalog } from "@/lib/api-agents";
import {
  type CatalogFilterDimension,
  type CatalogSortOption,
  useCatalogFilter,
} from "@/hooks/use-catalog-filter";
import type { SkillCatalogItem } from "@/types/agent";
import { CatalogSearchBar } from "./CatalogSearchBar";
import { SkillCard } from "./SkillCard";
import { SkillDetailSheet } from "./SkillDetailSheet";

const SCOPE_LABELS: Record<string, string> = {
  admin: "Admin",
  user: "User",
  workspace: "Workspace",
};

const SORT_OPTIONS: CatalogSortOption<SkillCatalogItem>[] = [
  {
    key: "name",
    label: "Name",
    compare: (a, b) => a.name.localeCompare(b.name),
  },
];

const FILTER_DIMENSIONS: CatalogFilterDimension<SkillCatalogItem>[] = [
  {
    key: "scope",
    label: "Scope",
    allLabel: "All Scopes",
    extract: (item) => SCOPE_LABELS[item.scope] ?? item.scope,
  },
  {
    key: "tag",
    label: "Tag",
    allLabel: "All Tags",
    extract: (item) => (item.tags.length > 0 ? item.tags : []),
  },
];

export default function SkillsSettings() {
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSkill, setSelectedSkill] = useState<SkillCatalogItem | null>(
    null,
  );

  useEffect(() => {
    getAgentCatalog()
      .then((catalog) => setSkills(catalog.skills))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const searchFields = useMemo(
    () => (item: SkillCatalogItem) => [
      item.name,
      item.description,
      ...item.tags,
    ],
    [],
  );

  const catalog = useCatalogFilter({
    items: skills,
    searchFields,
    sortOptions: SORT_OPTIONS,
    defaultSortKey: "name",
    filterDimensions: FILTER_DIMENSIONS,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Skills
          </CardTitle>
          <CardDescription>
            Skills available to agents in this instance. Click a skill to see
            its full content and details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : skills.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No skills available.
            </p>
          ) : (
            <>
              <CatalogSearchBar
                catalog={catalog}
                searchPlaceholder="Search skills..."
                sortOptions={SORT_OPTIONS}
                filterDimensions={FILTER_DIMENSIONS}
              />
              {catalog.filteredCount === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No skills match your search.
                </div>
              ) : (
                <div className="space-y-2">
                  {catalog.filteredItems.map((skill) => (
                    <SkillCard
                      key={skill.name}
                      skill={skill}
                      onClick={() => setSelectedSkill(skill)}
                    />
                  ))}
                </div>
              )}
            </>
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

      <SkillDetailSheet
        skill={selectedSkill}
        open={selectedSkill !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSkill(null);
        }}
      />
    </div>
  );
}
