import { useCallback, useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPatch } from "@/lib/api-client";
import {
  OptionSelect,
  PROVIDER_LABELS,
  PROVIDER_OPTIONS,
} from "../audio-helpers";
import type { SelectOption } from "../audio-helpers";

interface InstanceSettings {
  "audio.defaultSttModel"?: string;
  "audio.defaultTtsModel"?: string;
  "audio.defaultTtsVoice"?: string;
  "audio.defaultSttProvider"?: string;
  "audio.defaultTtsProvider"?: string;
  "audio.useStreamingStt"?: boolean;
  "audio.useStreamingTts"?: boolean;
  [key: string]: unknown;
}

/** Build provider options from PROVIDER_OPTIONS keys */
function providerOptions(filter: "stt" | "tts"): SelectOption[] {
  const opts: SelectOption[] = [];
  for (const [id, prov] of Object.entries(PROVIDER_OPTIONS)) {
    const hasCap =
      filter === "stt"
        ? prov.sttModels !== undefined || prov.hideSTTModel
        : prov.ttsModels !== undefined ||
          prov.ttsVoices !== undefined ||
          prov.hideTTSModel;
    if (hasCap) {
      opts.push({ value: id, label: PROVIDER_LABELS[id] ?? id });
    }
  }
  return opts;
}

/** Flatten all STT model options from all providers into a single list */
function allSttModelOptions(): SelectOption[] {
  const seen = new Set<string>();
  const opts: SelectOption[] = [];
  for (const [, prov] of Object.entries(PROVIDER_OPTIONS)) {
    for (const m of prov.sttModels ?? []) {
      if (!seen.has(m.value)) {
        seen.add(m.value);
        opts.push(m);
      }
    }
  }
  return opts;
}

/** Flatten all TTS model options from all providers into a single list */
function allTtsModelOptions(): SelectOption[] {
  const seen = new Set<string>();
  const opts: SelectOption[] = [];
  for (const [, prov] of Object.entries(PROVIDER_OPTIONS)) {
    for (const m of prov.ttsModels ?? []) {
      if (!seen.has(m.value)) {
        seen.add(m.value);
        opts.push(m);
      }
    }
  }
  return opts;
}

/** Flatten all TTS voice options from all providers into a single list */
function allTtsVoiceOptions(): SelectOption[] {
  const seen = new Set<string>();
  const opts: SelectOption[] = [];
  for (const [, prov] of Object.entries(PROVIDER_OPTIONS)) {
    for (const v of prov.ttsVoices ?? []) {
      if (!seen.has(v.value)) {
        seen.add(v.value);
        opts.push(v);
      }
    }
  }
  return opts;
}

export default function AudioDefaultsSettings() {
  const [settings, setSettings] = useState<InstanceSettings>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/admin/settings")
      .then((res) => res.json())
      .then((data: InstanceSettings) => setSettings(data))
      .catch(() => toast.error("Failed to load voice defaults"))
      .finally(() => setLoading(false));
  }, []);

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
          <CardTitle>Voice Defaults</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sttProviderOpts = providerOptions("stt");
  const ttsProviderOpts = providerOptions("tts");
  const sttModels = allSttModelOptions();
  const ttsModels = allTtsModelOptions();
  const ttsVoices = allTtsVoiceOptions();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Voice Defaults
        </CardTitle>
        <CardDescription>
          Default speech-to-text and text-to-speech configuration for this
          instance. Users can choose their own voice, speed, and auto-play
          behavior.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Provider & Model selection */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <OptionSelect
            id="default-stt-provider"
            label="STT Provider"
            options={sttProviderOpts}
            value={(settings["audio.defaultSttProvider"] as string) ?? ""}
            onChange={(val) =>
              handleSettingChange("audio.defaultSttProvider", val)
            }
            placeholder="Auto-detect"
          />
          <OptionSelect
            id="default-tts-provider"
            label="TTS Provider"
            options={ttsProviderOpts}
            value={(settings["audio.defaultTtsProvider"] as string) ?? ""}
            onChange={(val) =>
              handleSettingChange("audio.defaultTtsProvider", val)
            }
            placeholder="Auto-detect"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <OptionSelect
            id="default-stt-model"
            label="STT Model"
            options={sttModels}
            value={(settings["audio.defaultSttModel"] as string) ?? ""}
            onChange={(val) =>
              handleSettingChange("audio.defaultSttModel", val)
            }
            placeholder="Server default"
          />
          <OptionSelect
            id="default-tts-model"
            label="TTS Model"
            options={ttsModels}
            value={(settings["audio.defaultTtsModel"] as string) ?? ""}
            onChange={(val) =>
              handleSettingChange("audio.defaultTtsModel", val)
            }
            placeholder="Server default"
          />
          <OptionSelect
            id="default-tts-voice"
            label="TTS Voice"
            options={ttsVoices}
            value={(settings["audio.defaultTtsVoice"] as string) ?? ""}
            onChange={(val) =>
              handleSettingChange("audio.defaultTtsVoice", val)
            }
            placeholder="Server default"
          />
        </div>

        {/* Streaming toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="streaming-stt" className="text-sm">
                Streaming STT
              </Label>
              <p className="text-xs text-muted-foreground">
                Enable real-time streaming transcription (requires provider
                support).
              </p>
            </div>
            <Switch
              id="streaming-stt"
              checked={(settings["audio.useStreamingStt"] as boolean) ?? true}
              onCheckedChange={(checked) =>
                handleSettingChange("audio.useStreamingStt", checked)
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="streaming-tts" className="text-sm">
                Streaming TTS
              </Label>
              <p className="text-xs text-muted-foreground">
                Enable streaming speech synthesis for faster playback start
                (requires provider support).
              </p>
            </div>
            <Switch
              id="streaming-tts"
              checked={(settings["audio.useStreamingTts"] as boolean) ?? true}
              onCheckedChange={(checked) =>
                handleSettingChange("audio.useStreamingTts", checked)
              }
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
