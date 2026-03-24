import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiPost } from "@/lib/api-client";

interface QuantizationInfo {
  id: string;
  filename: string;
  sizeBytes: number;
}

interface InspectResult {
  sourceType: "huggingface" | "openrouter";
  candidate: {
    suggestedModelId: string;
    name: string;
    providerModel: string;
    capabilities: {
      modalities?: { input?: string[]; output?: string[] };
      streaming?: boolean;
      tools?: boolean;
      jsonSchema?: boolean;
      structuredOutputs?: boolean;
      reasoning?: { supported?: boolean };
      contextWindow?: number;
    };
    source: { url?: string; format?: string };
    quantizations?: QuantizationInfo[];
    architecture?: Record<string, unknown>;
    visionSizeBytes?: number;
  };
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

function formatBytes(bytes: number): string {
  if (!bytes) return "?";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

export default function ModelImportUrlDialog({
  open,
  onOpenChange,
  providers,
  onImported,
}: Props) {
  const [url, setUrl] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<InspectResult | null>(null);

  // Editable fields after inspection
  const [modelId, setModelId] = useState("");
  const [modelName, setModelName] = useState("");
  const [providerId, setProviderId] = useState("");
  const [providerModel, setProviderModel] = useState("");
  const [selectedQuant, setSelectedQuant] = useState("");
  const [tools, setTools] = useState(false);
  const [vision, setVision] = useState(false);

  function reset() {
    setUrl("");
    setResult(null);
    setModelId("");
    setModelName("");
    setProviderId("");
    setProviderModel("");
    setSelectedQuant("");
    setTools(false);
    setVision(false);
  }

  async function handleInspect() {
    if (!url.trim()) return;
    setInspecting(true);
    setResult(null);
    try {
      const res = await apiPost("/api/admin/models/inspect-url", { url });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to inspect URL");
        return;
      }
      const data = (await res.json()) as InspectResult;
      setResult(data);

      // Pre-fill editable fields
      const c = data.candidate;
      setModelId(c.suggestedModelId);
      setModelName(c.name);
      setProviderModel(c.providerModel);
      setTools(c.capabilities.tools ?? false);
      setVision(c.capabilities.modalities?.input?.includes("image") ?? false);

      // Pick a default provider
      if (data.sourceType === "openrouter") {
        const or = providers.find((p) => p.id === "openrouter");
        setProviderId(or?.id ?? providers[0]?.id ?? "");
      } else {
        // For HuggingFace GGUF, suggest llama-cpp or first available
        const local = providers.find(
          (p) =>
            p.id === "llama-cpp" || p.id === "ollama" || p.id === "lm-studio",
        );
        setProviderId(local?.id ?? providers[0]?.id ?? "");
      }

      // Default quantization
      if (c.quantizations && c.quantizations.length > 0 && c.quantizations[0]) {
        setSelectedQuant(c.quantizations[0].id);
      }
    } catch {
      toast.error("Failed to inspect URL");
    } finally {
      setInspecting(false);
    }
  }

  async function handleImport() {
    if (!modelId || !modelName || !providerId || !providerModel) {
      toast.error("All fields are required");
      return;
    }
    setImporting(true);
    try {
      const inputModalities = ["text"];
      if (vision) inputModalities.push("image");

      const quant = result?.candidate.quantizations?.find(
        (q) => q.id === selectedQuant,
      );

      const res = await apiPost("/api/admin/models/import", {
        models: [
          {
            id: modelId,
            name: modelName,
            provider: providerId,
            providerModel,
            capabilities: {
              modalities: { input: inputModalities, output: ["text"] },
              streaming: true,
              tools,
              jsonSchema: result?.candidate.capabilities.jsonSchema ?? false,
              structuredOutputs: false,
              reasoning: { supported: false },
              contextWindow:
                result?.candidate.capabilities.contextWindow ?? 8192,
            },
            source: {
              url: result?.candidate.source.url ?? url,
              format: result?.candidate.source.format,
              quantization: selectedQuant || undefined,
              sizeBytes: quant?.sizeBytes,
              architecture: result?.candidate.architecture,
              visionSizeBytes: result?.candidate.visionSizeBytes,
            },
          },
        ],
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Import failed");
        return;
      }
      const data = await res.json();
      if (data.created?.length > 0) {
        toast.success(`Model "${data.created[0]}" imported`);
      } else if (data.skipped?.length > 0) {
        toast.info(`Model "${data.skipped[0]}" already exists`);
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
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from URL</DialogTitle>
          <DialogDescription>
            Paste a HuggingFace or OpenRouter model URL to auto-detect metadata.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: URL input */}
        <div className="space-y-2">
          <Label htmlFor="import-url">Model URL</Label>
          <div className="flex gap-2">
            <Input
              id="import-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://huggingface.co/... or https://openrouter.ai/..."
              disabled={inspecting}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInspect();
              }}
            />
            <Button
              onClick={handleInspect}
              disabled={!url.trim() || inspecting}
              size="sm"
            >
              {inspecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Inspect"
              )}
            </Button>
          </div>
        </div>

        {/* Step 2: Editable fields after inspection */}
        {result && (
          <div className="grid gap-4 pt-2">
            <div className="flex gap-2 items-center">
              <Badge variant="secondary">{result.sourceType}</Badge>
              {result.candidate.source.format && (
                <Badge variant="outline">
                  {result.candidate.source.format}
                </Badge>
              )}
            </div>

            {/* Quantization selector */}
            {result.candidate.quantizations &&
              result.candidate.quantizations.length > 0 && (
                <div className="space-y-2">
                  <Label>Quantization</Label>
                  <Select
                    value={selectedQuant}
                    onValueChange={(v) => {
                      setSelectedQuant(v);
                      // Update providerModel and modelId with selected quant
                      const base = result.candidate.providerModel.split(":")[0];
                      setProviderModel(`${base}:${v}`);
                      const baseId = result.candidate.suggestedModelId.replace(
                        /(-[a-z0-9]+-[a-z0-9]+(-[a-z0-9]+)*)$/,
                        "",
                      );
                      const normalizedQuant = v
                        .toLowerCase()
                        .replace(/_/g, "-");
                      setModelId(`${baseId}-${normalizedQuant}`);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {result.candidate.quantizations.map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.id} ({formatBytes(q.sizeBytes)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

            <div className="space-y-2">
              <Label htmlFor="import-model-id">Model ID</Label>
              <Input
                id="import-model-id"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-name">Display Name</Label>
              <Input
                id="import-name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider..." />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-provider-model">Provider Model ID</Label>
              <Input
                id="import-provider-model"
                value={providerModel}
                onChange={(e) => setProviderModel(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Capabilities</Label>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={tools}
                    onCheckedChange={(c) => setTools(c === true)}
                  />
                  Tool calling
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={vision}
                    onCheckedChange={(c) => setVision(c === true)}
                  />
                  Vision
                </div>
              </div>
            </div>

            {result.candidate.capabilities.contextWindow && (
              <p className="text-xs text-muted-foreground">
                Context window:{" "}
                {result.candidate.capabilities.contextWindow.toLocaleString()}{" "}
                tokens
              </p>
            )}
          </div>
        )}

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
          {result && (
            <Button onClick={handleImport} disabled={importing}>
              {importing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Import Model
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
