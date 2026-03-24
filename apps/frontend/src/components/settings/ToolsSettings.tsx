import { useEffect, useMemo, useState } from "react";
import { Wrench } from "lucide-react";
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
import type { AgentCatalogItem } from "@/types/agent";
import { CatalogSearchBar } from "./CatalogSearchBar";
import { ToolCard } from "./ToolCard";
import { ToolDetailSheet } from "./ToolDetailSheet";

const SORT_OPTIONS: CatalogSortOption<AgentCatalogItem>[] = [
  {
    key: "label",
    label: "Name",
    compare: (a, b) => (a.label ?? a.name).localeCompare(b.label ?? b.name),
  },
];

const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Available",
  setup_required: "Setup Required",
  disabled: "Disabled",
};

const FILTER_DIMENSIONS: CatalogFilterDimension<AgentCatalogItem>[] = [
  {
    key: "availability",
    label: "Status",
    allLabel: "All Statuses",
    extract: (item) =>
      AVAILABILITY_LABELS[item.availability ?? "available"] ?? "Available",
  },
  {
    key: "accessLevel",
    label: "Access",
    allLabel: "All Access Levels",
    extract: (item) =>
      item.accessLevel === "read" ? "Read-only" : "Read & Write",
  },
];

export default function ToolsSettings() {
  const [tools, setTools] = useState<AgentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<AgentCatalogItem | null>(
    null,
  );

  useEffect(() => {
    getAgentCatalog()
      .then((catalog) => setTools(catalog.tools))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const searchFields = useMemo(
    () => (item: AgentCatalogItem) => [
      item.label ?? "",
      item.name,
      item.description,
    ],
    [],
  );

  const catalog = useCatalogFilter({
    items: tools,
    searchFields,
    sortOptions: SORT_OPTIONS,
    defaultSortKey: "label",
    filterDimensions: FILTER_DIMENSIONS,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Tools
          </CardTitle>
          <CardDescription>
            Tools available to agents in this instance. Click a tool to see its
            parameters and details.
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
          ) : tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tools available. Add MCP servers to enable tool integrations.
            </p>
          ) : (
            <>
              <CatalogSearchBar
                catalog={catalog}
                searchPlaceholder="Search tools..."
                sortOptions={SORT_OPTIONS}
                filterDimensions={FILTER_DIMENSIONS}
              />
              {catalog.filteredCount === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No tools match your search.
                </div>
              ) : (
                <div className="space-y-2">
                  {catalog.filteredItems.map((tool) => (
                    <ToolCard
                      key={tool.name}
                      tool={tool}
                      onClick={() => setSelectedTool(tool)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ToolDetailSheet
        tool={selectedTool}
        open={selectedTool !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTool(null);
        }}
      />
    </div>
  );
}
