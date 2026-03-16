import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import McpServerManager from "@/components/settings/admin/McpServerManager";
import ModelManager from "@/components/settings/admin/ModelManager";
import ProviderManager from "@/components/settings/admin/ProviderManager";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPatch, apiPut } from "@/lib/api-client";
import { listModels, type ModelSummary } from "@/lib/api-models";

const NO_MODEL_VALUE = "__none__";

interface ModelSelectionState {
  backend: string | null;
  workers: string | null;
}

interface InstanceSettings {
  "audio.defaultSttModel"?: string;
  "audio.defaultTtsModel"?: string;
  "audio.defaultTtsVoice"?: string;
  "instance.registrationEnabled"?: boolean;
  [key: string]: unknown;
}

export default function SystemSettings() {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selection, setSelection] = useState<ModelSelectionState>({
    backend: null,
    workers: null,
  });
  const [settings, setSettings] = useState<InstanceSettings>({});
  const [loading, setLoading] = useState(true);

  // Load models, selection, and instance settings
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
      apiGet("/api/admin/settings")
        .then((res) => res.json())
        .then((data: InstanceSettings) => setSettings(data)),
    ])
      .catch(() => toast.error("Failed to load system settings"))
      .finally(() => {
        setModelsLoading(false);
        setLoading(false);
      });
  }, []);

  // Group models by provider
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

  const handleSettingChange = useCallback(
    async (key: string, value: unknown) => {
      try {
        await apiPatch("/api/admin/settings", { [key]: value });
        setSettings((prev) => ({ ...prev, [key]: value }));
        toast.success("Setting updated");
      } catch {
        toast.error("Failed to update setting");
      }
    },
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Settings</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Settings</CardTitle>
        <CardDescription>
          Instance-wide configuration. Changes affect all users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Model Selection */}
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Default Models</h3>
            <p className="text-sm text-muted-foreground">
              Select which AI models are used by default for different contexts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
        </section>

        <Separator />

        {/* Audio Defaults */}
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Audio Defaults</h3>
            <p className="text-sm text-muted-foreground">
              Default speech-to-text and text-to-speech models. Users can
              override these in their own settings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stt-model">STT Model</Label>
              <Input
                id="stt-model"
                value={(settings["audio.defaultSttModel"] as string) ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    "audio.defaultSttModel": e.target.value,
                  }))
                }
                onBlur={(e) =>
                  handleSettingChange("audio.defaultSttModel", e.target.value)
                }
                placeholder="Server default"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tts-model">TTS Model</Label>
              <Input
                id="tts-model"
                value={(settings["audio.defaultTtsModel"] as string) ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    "audio.defaultTtsModel": e.target.value,
                  }))
                }
                onBlur={(e) =>
                  handleSettingChange("audio.defaultTtsModel", e.target.value)
                }
                placeholder="Server default"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tts-voice">TTS Voice</Label>
              <Input
                id="tts-voice"
                value={(settings["audio.defaultTtsVoice"] as string) ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    "audio.defaultTtsVoice": e.target.value,
                  }))
                }
                onBlur={(e) =>
                  handleSettingChange("audio.defaultTtsVoice", e.target.value)
                }
                placeholder="Server default"
              />
            </div>
          </div>
        </section>

        <Separator />

        {/* Registration */}
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Registration</h3>
            <p className="text-sm text-muted-foreground">
              Control whether new users can create accounts on this instance.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow new user registration</Label>
              <p className="text-xs text-muted-foreground">
                When disabled, only existing users can log in.
              </p>
            </div>
            <Switch
              checked={settings["instance.registrationEnabled"] !== false}
              onCheckedChange={(checked) =>
                handleSettingChange("instance.registrationEnabled", checked)
              }
            />
          </div>
        </section>

        <Separator />

        {/* Provider Management */}
        <ProviderManager />

        <Separator />

        {/* Model Management */}
        <ModelManager />

        <Separator />

        {/* MCP Server Management */}
        <McpServerManager />
      </CardContent>
    </Card>
  );
}
