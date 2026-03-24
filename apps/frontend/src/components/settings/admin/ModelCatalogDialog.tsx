import { useCallback, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api-client";

interface CatalogModel {
  providerModel: string;
  name: string;
  contextWindow?: number;
  inputModalities: string[];
  tools?: boolean;
  jsonSchema?: boolean;
  sourceUrl?: string;
}

interface ProviderPreset {
  id: string;
  name: string;
  supportsCatalogDiscovery: boolean;
}

interface ProviderOption {
  id: string;
  dialect: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providers: ProviderOption[];
  onImported: () => void;
}

export default function ModelCatalogDialog({
  open,
  onOpenChange,
  providers,
  onImported,
}: Props) {
  const [providerId, setProviderId] = useState("");
  const [catalogProviders, setCatalogProviders] = useState<ProviderPreset[]>(
    [],
  );
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadPresets = useCallback(async () => {
    if (presetsLoaded) return;
    try {
      const res = await apiGet("/api/admin/provider-presets");
      const data = await res.json();
      const presets = (data.items as ProviderPreset[]).filter(
        (p) => p.supportsCatalogDiscovery,
      );
      // Only show presets that the user has actually configured as providers
      const configuredIds = new Set(providers.map((p) => p.id));
      setCatalogProviders(presets.filter((p) => configuredIds.has(p.id)));
      setPresetsLoaded(true);
    } catch {
      toast.error("Failed to load provider presets");
    }
  }, [presetsLoaded, providers]);

  function reset() {
    setProviderId("");
    setCatalog([]);
    setSearch("");
    setSelected(new Set());
  }

  async function handleFetchCatalog(id: string) {
    setProviderId(id);
    setCatalog([]);
    setSelected(new Set());
    setSearch("");
    setLoading(true);
    try {
      const res = await apiPost(`/api/admin/providers/${id}/catalog`);
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to fetch catalog");
        return;
      }
      const data = await res.json();
      setCatalog(data.items || []);
    } catch {
      toast.error("Failed to fetch catalog");
    } finally {
      setLoading(false);
    }
  }

  function toggleModel(providerModel: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(providerModel)) {
        next.delete(providerModel);
      } else {
        next.add(providerModel);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((m) => m.providerModel)));
    }
  }

  const filtered = catalog.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.providerModel.toLowerCase().includes(q)
    );
  });

  async function handleImport() {
    if (selected.size === 0) {
      toast.error("Select at least one model");
      return;
    }
    setImporting(true);
    try {
      const models = catalog
        .filter((m) => selected.has(m.providerModel))
        .map((m) => {
          const modelIdPart = (
            m.providerModel.split("/").pop() ?? m.providerModel
          )
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
          return {
            id: `${providerId}:${modelIdPart}`,
            name: m.name,
            provider: providerId,
            providerModel: m.providerModel,
            capabilities: {
              modalities: {
                input:
                  m.inputModalities.length > 0 ? m.inputModalities : ["text"],
                output: ["text"],
              },
              streaming: true,
              tools: m.tools ?? false,
              jsonSchema: m.jsonSchema ?? false,
              structuredOutputs: false,
              reasoning: { supported: false },
              contextWindow: m.contextWindow ?? 8192,
            },
            source: {
              url: m.sourceUrl,
            },
          };
        });

      const res = await apiPost("/api/admin/models/import", { models });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Import failed");
        return;
      }
      const data = await res.json();
      const count = data.created?.length ?? 0;
      const skipped = data.skipped?.length ?? 0;
      if (count > 0) {
        toast.success(
          `Imported ${count} model${count > 1 ? "s" : ""}${skipped > 0 ? `, ${skipped} already existed` : ""}`,
        );
      } else if (skipped > 0) {
        toast.info(`All ${skipped} selected models already exist`);
      }
      reset();
      onOpenChange(false);
      onImported();
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) loadPresets();
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add from Provider</DialogTitle>
          <DialogDescription>
            Browse available models from a provider and import them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col">
          {/* Provider selector */}
          <div className="space-y-2">
            <Label>Provider</Label>
            {catalogProviders.length === 0 && presetsLoaded ? (
              <p className="text-sm text-muted-foreground">
                No configured providers support catalog discovery. Configure
                OpenRouter or OpenAI first.
              </p>
            ) : (
              <Select
                value={providerId}
                onValueChange={handleFetchCatalog}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a provider..." />
                </SelectTrigger>
                <SelectContent>
                  {catalogProviders.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Loading state */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Fetching available models...
            </div>
          )}

          {/* Catalog table */}
          {catalog.length > 0 && !loading && (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search models..."
                    className="pl-8"
                  />
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {selected.size} selected
                </span>
              </div>

              <ScrollArea className="flex-1 min-h-0 border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            filtered.length > 0 &&
                            selected.size === filtered.length
                          }
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead>Capabilities</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.slice(0, 100).map((m) => (
                      <TableRow
                        key={m.providerModel}
                        className="cursor-pointer"
                        onClick={() => toggleModel(m.providerModel)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected.has(m.providerModel)}
                            onCheckedChange={() => toggleModel(m.providerModel)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{m.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {m.providerModel}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {m.contextWindow
                            ? `${(m.contextWindow / 1024).toFixed(0)}k`
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {m.inputModalities?.includes("image") && (
                              <Badge variant="secondary" className="text-xs">
                                vision
                              </Badge>
                            )}
                            {m.tools && (
                              <Badge variant="secondary" className="text-xs">
                                tools
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filtered.length > 100 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Showing first 100 of {filtered.length} models. Use search to
                    narrow results.
                  </p>
                )}
              </ScrollArea>
            </>
          )}

          {/* Empty state after load */}
          {providerId && !loading && catalog.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">
              No models found from this provider.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          {catalog.length > 0 && (
            <Button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
            >
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Import {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
