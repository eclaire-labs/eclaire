import { useCallback, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPut } from "@/lib/api-client";
import { listModels, type ModelSummary } from "@/lib/api-models";

const NO_MODEL_VALUE = "__none__";

interface ModelSelectionState {
  backend: string | null;
  workers: string | null;
}

export default function ModelSelectionSettings() {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selection, setSelection] = useState<ModelSelectionState>({
    backend: null,
    workers: null,
  });

  useEffect(() => {
    Promise.all([
      listModels().then((res) => setModels(res.items)),
      apiGet("/api/admin/model-selection")
        .then((res) => res.json())
        .then((data: Record<string, string>) =>
          setSelection({
            backend: data.backend ?? null,
            workers: data.workers ?? null,
          }),
        ),
    ])
      .catch(() => toast.error("Failed to load model selection"))
      .finally(() => setModelsLoading(false));
  }, []);

  const grouped = models.reduce<Record<string, ModelSummary[]>>(
    (acc, model) => {
      const key = model.provider;
      if (!acc[key]) acc[key] = [];
      acc[key].push(model);
      return acc;
    },
    {},
  );
  const providers = Object.keys(grouped).sort();

  const handleModelChange = useCallback(
    async (context: "backend" | "workers", modelId: string | null) => {
      if (!modelId) return;
      try {
        await apiPut(`/api/admin/model-selection/${context}`, { modelId });
        setSelection((prev) => ({ ...prev, [context]: modelId }));
        toast.success(`Default ${context} model updated`);
      } catch {
        toast.error("Failed to update model selection");
      }
    },
    [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Model Defaults
        </CardTitle>
        <CardDescription>
          Select which AI models are used by default for different contexts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="backend-model">Backend (text-only)</Label>
            <Select
              value={selection.backend ?? NO_MODEL_VALUE}
              onValueChange={(v) =>
                handleModelChange("backend", v === NO_MODEL_VALUE ? null : v)
              }
              disabled={modelsLoading}
            >
              <SelectTrigger id="backend-model">
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MODEL_VALUE}>Not set</SelectItem>
                {providers.length > 0 && <SelectSeparator />}
                {providers.map((provider) => (
                  <SelectGroup key={provider}>
                    <SelectLabel>{provider}</SelectLabel>
                    {(grouped[provider] ?? []).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for chat, agents, and text processing.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workers-model">Workers (text + vision)</Label>
            <Select
              value={selection.workers ?? NO_MODEL_VALUE}
              onValueChange={(v) =>
                handleModelChange("workers", v === NO_MODEL_VALUE ? null : v)
              }
              disabled={modelsLoading}
            >
              <SelectTrigger id="workers-model">
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MODEL_VALUE}>Not set</SelectItem>
                {providers.length > 0 && <SelectSeparator />}
                {providers.map((provider) => (
                  <SelectGroup key={provider}>
                    <SelectLabel>{provider}</SelectLabel>
                    {(grouped[provider] ?? []).map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Used for background processing (bookmarks, documents, photos).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
