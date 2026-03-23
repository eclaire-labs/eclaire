import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
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
import type { AgentCatalogItem } from "@/types/agent";

export default function ToolsSettings() {
  const [tools, setTools] = useState<AgentCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAgentCatalog()
      .then((catalog) => setTools(catalog.tools))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Tools
          </CardTitle>
          <CardDescription>
            Tools available to agents in this instance. Agents select which
            tools to use in their configuration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tools available. Add MCP servers to enable tool integrations.
            </p>
          ) : (
            <div className="space-y-3">
              {tools.map((tool) => (
                <div
                  key={tool.name}
                  className="flex items-start gap-3 rounded-md border p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{tool.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {tool.name}
                      </Badge>
                    </div>
                    {tool.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {tool.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
