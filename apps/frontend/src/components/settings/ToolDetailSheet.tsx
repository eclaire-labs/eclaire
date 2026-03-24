import { ShieldCheck, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgentCatalogItem } from "@/types/agent";

interface ToolDetailSheetProps {
  tool: AgentCatalogItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface JsonSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: { type?: string };
}

function ParametersTable({
  parameters,
}: {
  parameters: Record<string, unknown>;
}) {
  const properties = (parameters.properties ?? {}) as Record<
    string,
    JsonSchemaProperty
  >;
  const required = (parameters.required ?? []) as string[];
  const entries = Object.entries(properties);

  if (entries.length === 0) return null;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Parameter</TableHead>
            <TableHead className="w-[80px]">Type</TableHead>
            <TableHead>Description</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(([name, prop]) => (
            <TableRow key={name}>
              <TableCell className="font-mono text-xs">
                {name}
                {required.includes(name) && (
                  <span className="text-destructive ml-0.5">*</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatType(prop)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {prop.description ?? ""}
                {prop.enum && (
                  <span className="ml-1 text-[10px]">
                    ({prop.enum.join(", ")})
                  </span>
                )}
                {prop.default !== undefined && (
                  <span className="ml-1 text-[10px]">
                    default: {String(prop.default)}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatType(prop: JsonSchemaProperty): string {
  if (Array.isArray(prop.type)) {
    return prop.type.filter((t) => t !== "null").join(" | ");
  }
  if (prop.type === "array" && prop.items?.type) {
    return `${prop.items.type}[]`;
  }
  return prop.type ?? "any";
}

export function ToolDetailSheet({
  tool,
  open,
  onOpenChange,
}: ToolDetailSheetProps) {
  if (!tool) return null;

  const status = tool.availability ?? "available";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
              <Wrench className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle>{tool.label ?? tool.name}</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {tool.name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-6 space-y-6">
          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            {status !== "available" && (
              <Badge
                variant="outline"
                className={
                  status === "setup_required"
                    ? "border-yellow-500/50 text-yellow-700 dark:text-yellow-400"
                    : "border-gray-400/50 text-gray-500"
                }
              >
                {status === "setup_required" ? "Setup Required" : "Disabled"}
              </Badge>
            )}
            {status === "available" && (
              <Badge
                variant="outline"
                className="border-green-500/50 text-green-700 dark:text-green-400"
              >
                Available
              </Badge>
            )}
            {tool.needsApproval && (
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="h-3 w-3" />
                Requires Approval
              </Badge>
            )}
            {tool.visibility && tool.visibility !== "all" && (
              <Badge variant="secondary" className="text-[10px]">
                {tool.visibility} only
              </Badge>
            )}
          </div>

          {/* Availability reason */}
          {tool.availabilityReason && status !== "available" && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              {tool.availabilityReason}
            </div>
          )}

          {/* Description */}
          <div>
            <h4 className="text-sm font-medium mb-1">Description</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {tool.description}
            </p>
          </div>

          {/* Parameters */}
          {tool.parameters &&
            Object.keys(
              (tool.parameters as Record<string, unknown>).properties ?? {},
            ).length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-medium mb-2">Parameters</h4>
                  <ParametersTable parameters={tool.parameters} />
                </div>
              </>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
