import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetupPresets } from "@/hooks/use-onboarding";
import { apiGet, apiPost } from "@/lib/api-client";
import type { StepProps } from "../SetupWizard";

interface CatalogModel {
  providerModel: string;
  name: string;
  contextWindow?: number;
  inputModalities: string[];
  tools?: boolean;
  jsonSchema?: boolean;
  sourceUrl?: string;
}

function ModelPicker({
  label,
  hint,
  catalog,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  catalog: CatalogModel[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {value && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-sm font-normal">
            {value}
            <button
              type="button"
              onClick={() => onChange("")}
              className="ml-1 rounded-sm hover:bg-muted"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}
      <Command className="rounded-lg border" shouldFilter={true}>
        <CommandInput placeholder="Search models..." />
        <CommandList className="max-h-48">
          <CommandEmpty>No models found.</CommandEmpty>
          <CommandGroup>
            {catalog.map((m) => (
              <CommandItem
                key={m.providerModel}
                value={`${m.name} ${m.providerModel}`}
                onSelect={() => onChange(m.providerModel)}
              >
                <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm truncate">{m.name}</span>
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {m.providerModel}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.inputModalities?.includes("image") && (
                      <Badge variant="secondary" className="text-xs px-1.5">
                        vision
                      </Badge>
                    )}
                    {m.tools && (
                      <Badge variant="secondary" className="text-xs px-1.5">
                        tools
                      </Badge>
                    )}
                    {m.contextWindow && (
                      <span className="text-xs text-muted-foreground">
                        {Math.round(m.contextWindow / 1024)}k
                      </span>
                    )}
                    {value === m.providerModel && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

export function SelectModelsStep({
  state,
  onNext,
  onBack,
  isAdvancing,
}: StepProps) {
  const { data: presets } = useSetupPresets();
  const preset = presets?.find((p) => p.id === state.selectedPreset);

  const [providers, setProviders] = useState<
    Array<{ id: string; name?: string }>
  >([]);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [backendModel, setBackendModel] = useState("");
  const [workersModel, setWorkersModel] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // Load existing providers and catalog when preset changes
  const isCloud = preset?.isCloud ?? false;
  useEffect(() => {
    apiGet("/api/admin/providers")
      .then((res) => res.json())
      .then(async (data: { items: Array<{ id: string }> }) => {
        setProviders(data.items);
        // Try to load catalog from first provider
        if (data.items.length > 0 && isCloud && data.items[0]) {
          setIsLoadingCatalog(true);
          try {
            const catRes = await apiPost(
              `/api/admin/providers/${data.items[0].id}/catalog`,
            );
            const catData = (await catRes.json()) as {
              items: CatalogModel[];
            };
            setCatalog(catData.items ?? []);
          } catch {
            // Catalog may not be available for all providers
          } finally {
            setIsLoadingCatalog(false);
          }
        }
      })
      .catch(() => {});
  }, [isCloud]);

  // Compute filtered catalogs for each picker
  const visionModels = catalog.filter((m) =>
    m.inputModalities?.includes("image"),
  );
  const backendCatalog = visionModels.length > 0 ? visionModels : catalog;

  async function handleImportAndContinue() {
    if (!backendModel) {
      toast.error("Please specify at least a backend model.");
      return;
    }

    setIsImporting(true);
    try {
      const providerId = providers[0]?.id;
      if (!providerId) {
        toast.error("No provider configured. Go back and set one up.");
        return;
      }

      const backendCatalogEntry = catalog.find(
        (m) => m.providerModel === backendModel,
      );
      const models = [
        {
          id: `${backendModel.replace(/[^a-zA-Z0-9-_.]/g, "-")}`,
          name: backendModel,
          provider: providerId,
          providerModel: backendModel,
          capabilities: {
            chat: true,
            tools: backendCatalogEntry?.tools ?? true,
            streaming: true,
            vision:
              backendCatalogEntry?.inputModalities?.includes("image") ?? false,
          },
        },
      ];

      // Add workers model if different from backend
      const workersProviderId =
        providers.length > 1 ? (providers[1]?.id ?? providerId) : providerId;
      const actualWorkersModel = workersModel || backendModel;
      if (actualWorkersModel !== backendModel || providers.length > 1) {
        const workersCatalogEntry = catalog.find(
          (m) => m.providerModel === actualWorkersModel,
        );
        models.push({
          id: `${actualWorkersModel.replace(/[^a-zA-Z0-9-_.]/g, "-")}-workers`,
          name: `${actualWorkersModel} (workers)`,
          provider: workersProviderId,
          providerModel: actualWorkersModel,
          capabilities: {
            chat: true,
            tools: false,
            streaming: true,
            vision:
              workersCatalogEntry?.inputModalities?.includes("image") ?? false,
          },
        });
      }

      const firstModelId = models[0]?.id ?? "";
      const setDefaults: Record<string, string> = {
        backend: firstModelId,
      };
      if (models.length > 1 && models[1]) {
        setDefaults.workers = models[1].id;
      } else {
        setDefaults.workers = firstModelId;
      }

      // Use onboarding step endpoint so model import goes through the shared engine
      onNext({ models, setDefaults });
    } catch (error) {
      toast.error("Failed to import models", {
        description:
          error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsImporting(false);
    }
  }

  const hasCatalog = preset?.isCloud && catalog.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Models</CardTitle>
        <CardDescription>
          Choose which AI models to use. The backend model powers the assistant;
          the workers model handles content processing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoadingCatalog && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading model catalog...
          </div>
        )}

        {hasCatalog ? (
          <div className="space-y-6">
            <ModelPicker
              label="Backend Model (assistant)"
              hint="Vision-capable models are recommended for the assistant."
              catalog={backendCatalog}
              value={backendModel}
              onChange={setBackendModel}
            />
            <ModelPicker
              label="Workers Model (processing)"
              hint="Defaults to backend model if empty. All models shown."
              catalog={catalog}
              value={workersModel}
              onChange={setWorkersModel}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="backendModel">Backend Model (assistant)</Label>
                <Input
                  id="backendModel"
                  placeholder="e.g., qwen3-14b"
                  value={backendModel}
                  onChange={(e) => setBackendModel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workersModel">Workers Model (processing)</Label>
                <Input
                  id="workersModel"
                  placeholder="Same as backend if empty"
                  value={workersModel}
                  onChange={(e) => setWorkersModel(e.target.value)}
                />
              </div>
            </div>
            {!preset?.isCloud && (
              <p className="text-xs text-muted-foreground">
                Enter the model name exactly as your local server reports it
                (e.g., the model ID from llama-server or Ollama).
              </p>
            )}
          </>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={handleImportAndContinue}
            disabled={!backendModel || isImporting || isAdvancing}
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Import & Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
