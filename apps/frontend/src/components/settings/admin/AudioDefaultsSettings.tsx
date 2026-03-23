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
import { apiGet, apiPatch } from "@/lib/api-client";
import { OptionSelect, PROVIDER_OPTIONS } from "../audio-helpers";
import type { SelectOption } from "../audio-helpers";

interface InstanceSettings {
  "audio.defaultSttModel"?: string;
  "audio.defaultTtsModel"?: string;
  "audio.defaultTtsVoice"?: string;
  [key: string]: unknown;
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
          Default speech-to-text and text-to-speech models for this instance.
          Users can override these in their personal Voice settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
