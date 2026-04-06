import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetupPresets } from "@/hooks/use-onboarding";
import { apiGet, apiPost } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { StepProps } from "../SetupWizard";

interface CatalogModel {
  providerModel: string;
  name: string;
  contextWindow?: number;
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

      const models = [
        {
          id: `${backendModel.replace(/[^a-zA-Z0-9-_.]/g, "-")}`,
          name: backendModel,
          provider: providerId,
          providerModel: backendModel,
          capabilities: {
            chat: true,
            tools: true,
            streaming: true,
            vision: false,
          },
        },
      ];

      // Add workers model if different from backend
      const workersProviderId =
        providers.length > 1 ? (providers[1]?.id ?? providerId) : providerId;
      const actualWorkersModel = workersModel || backendModel;
      if (actualWorkersModel !== backendModel || providers.length > 1) {
        models.push({
          id: `${actualWorkersModel.replace(/[^a-zA-Z0-9-_.]/g, "-")}-workers`,
          name: `${actualWorkersModel} (workers)`,
          provider: workersProviderId,
          providerModel: actualWorkersModel,
          capabilities: {
            chat: true,
            tools: false,
            streaming: true,
            vision: false,
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
      toast.success("Models configured!");
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
          Choose which AI models to use. The backend model powers the assistant;
          the workers model handles content processing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Catalog for cloud providers */}
        {preset?.isCloud && catalog.length > 0 && (
          <div className="space-y-2">
            <Label>Available Models</Label>
            <div className="max-h-48 overflow-y-auto rounded-lg border">
              {catalog.slice(0, 30).map((m) => (
                <button
                  key={m.providerModel}
                  type="button"
                  onClick={() => {
                    if (!backendModel) {
                      setBackendModel(m.providerModel);
                    } else if (!workersModel) {
                      setWorkersModel(m.providerModel);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 border-b last:border-b-0",
                    (backendModel === m.providerModel ||
                      workersModel === m.providerModel) &&
                      "bg-primary/5",
                  )}
                >
                  <span className="truncate">{m.name}</span>
                  {m.contextWindow && (
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {Math.round(m.contextWindow / 1024)}k
                    </span>
                  )}
                </button>
              ))}
            </div>
            {isLoadingCatalog && (
              <p className="text-xs text-muted-foreground">
                Loading model catalog...
              </p>
            )}
          </div>
        )}

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
            Enter the model name exactly as your local server reports it (e.g.,
            the model ID from llama-server or Ollama).
          </p>
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
