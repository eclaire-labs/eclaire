import { ArrowLeft, ArrowRight, Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const [mainModel, setMainModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const isCloud = preset?.isCloud ?? false;

  // Load existing providers and catalog when preset changes
  useEffect(() => {
    apiGet("/api/admin/providers")
      .then((res) => res.json())
      .then(async (data: { items: Array<{ id: string }> }) => {
        setProviders(data.items);
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

  // Determine if the selected main model has vision capability
  const selectedEntry = catalog.find((m) => m.providerModel === mainModel);
  const mainHasVision =
    selectedEntry?.inputModalities?.includes("image") ?? false;
  const visionCatalog = catalog.filter((m) =>
    m.inputModalities?.includes("image"),
  );
  const needsVisionPicker =
    isCloud && mainModel && !mainHasVision && visionCatalog.length > 0;

  const hasCatalog = isCloud && catalog.length > 0;

  async function handleContinue() {
    if (!mainModel) {
      toast.error("Please select a model.");
      return;
    }

    setIsImporting(true);
    try {
      const providerId = providers[0]?.id;
      if (!providerId) {
        toast.error("No provider configured. Go back and set one up.");
        return;
      }

      const mainCatalogEntry = catalog.find(
        (m) => m.providerModel === mainModel,
      );
      const models = [
        {
          id: `${mainModel.replace(/[^a-zA-Z0-9-_.]/g, "-")}`,
          name: mainModel,
          provider: providerId,
          providerModel: mainModel,
          capabilities: {
            chat: true,
            tools: mainCatalogEntry?.tools ?? true,
            streaming: true,
            vision:
              mainCatalogEntry?.inputModalities?.includes("image") ?? false,
          },
        },
      ];

      // Determine workers model
      const workersProviderId =
        providers.length > 1 ? (providers[1]?.id ?? providerId) : providerId;
      const effectiveVisionModel =
        needsVisionPicker && visionModel ? visionModel : mainModel;

      if (effectiveVisionModel !== mainModel || providers.length > 1) {
        const visionCatalogEntry = catalog.find(
          (m) => m.providerModel === effectiveVisionModel,
        );
        models.push({
          id: `${effectiveVisionModel.replace(/[^a-zA-Z0-9-_.]/g, "-")}-workers`,
          name: `${effectiveVisionModel} (workers)`,
          provider: workersProviderId,
          providerModel: effectiveVisionModel,
          capabilities: {
            chat: true,
            tools: false,
            streaming: true,
            vision:
              visionCatalogEntry?.inputModalities?.includes("image") ?? false,
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Models</CardTitle>
        <CardDescription>
          Choose which AI model to use. You can configure additional models
          later in settings.
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
              label="Model"
              hint="Vision-capable models are recommended so Eclaire can process documents."
              catalog={catalog}
              value={mainModel}
              onChange={(v) => {
                setMainModel(v);
                setVisionModel("");
              }}
            />
            {needsVisionPicker && (
              <>
                <Alert>
                  <AlertDescription className="text-sm">
                    The selected model doesn't support image input. Pick a
                    vision-capable model below for document processing, or
                    continue without one.
                  </AlertDescription>
                </Alert>
                <ModelPicker
                  label="Document Processing Model"
                  hint="Used for processing images and documents."
                  catalog={visionCatalog}
                  value={visionModel}
                  onChange={setVisionModel}
                />
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="mainModel">Model Name</Label>
            <Input
              id="mainModel"
              placeholder="e.g., qwen3-14b"
              value={mainModel}
              onChange={(e) => setMainModel(e.target.value)}
            />
            {!isCloud && (
              <p className="text-xs text-muted-foreground">
                Enter the model name exactly as your local server reports it.
                You can configure a separate vision model for document
                processing later in settings.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={handleContinue}
            disabled={!mainModel || isImporting || isAdvancing}
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
