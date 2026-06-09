import { useQueryClient } from "@tanstack/react-query";
import { Mic } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAudio } from "@/hooks/use-audio";
import { useAuth } from "@/hooks/use-auth";
import { apiGet, apiPatch } from "@/lib/api-client";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";

import { modelLabel, PROVIDER_OPTIONS } from "./audio-helpers";
import { SttSettingsCard } from "./voice/SttSettingsCard";
import { TtsSettingsCard } from "./voice/TtsSettingsCard";
import type { InstanceSettings } from "./voice/utils";

export default function VoiceSettings() {
  const queryClient = useQueryClient();
  const { data: authData } = useAuth();
  const isAdmin =
    (authData?.user as Record<string, unknown> | undefined)?.isInstanceAdmin ===
    true;
  const [preferences, updatePreference, isLoaded] = useAssistantPreferences();
  const {
    isAudioAvailable,
    isCheckingAvailability,
    isStreamingSttEnabled,
    ttsDefaults,
    providers,
    checkConnection,
    synthesize,
    isSynthesizing,
    transcribe,
  } = useAudio();

  // --- Instance settings (lifted from former WorkspaceDefaults) ---
  const [instanceSettings, setInstanceSettings] = useState<InstanceSettings>(
    {},
  );
  const [instanceLoading, setInstanceLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/admin/settings")
      .then((res) => res.json())
      .then((data: InstanceSettings) => setInstanceSettings(data))
      .catch(() => toast.error("Failed to load workspace defaults"))
      .finally(() => setInstanceLoading(false));
  }, []);

  const handleSettingChange = useCallback(
    async (key: string, value: unknown) => {
      try {
        await apiPatch("/api/admin/settings", { [key]: value });
        setInstanceSettings((prev) => ({ ...prev, [key]: value }));
        await queryClient.invalidateQueries({
          queryKey: ["instance-defaults"],
        });
        toast.success("Setting updated");
      } catch {
        toast.error("Failed to update setting");
      }
    },
    [queryClient],
  );

  // --- Loading guard ---
  if (!isLoaded) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5" />
              Speech-to-Text
            </CardTitle>
            <CardDescription>Loading preferences...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // --- Derived values ---
  const firstTtsProvider = providers.find((p) => p.capabilities.tts);
  const activeTtsProvider =
    preferences.ttsProvider || firstTtsProvider?.providerId || "";
  const ttsOpts = PROVIDER_OPTIONS[activeTtsProvider];

  // Instance-level values for admin controls
  const instSttProvider =
    (instanceSettings["audio.defaultSttProvider"] as string) ?? "";
  const instTtsProvider =
    (instanceSettings["audio.defaultTtsProvider"] as string) ?? "";

  // Resolve provider health for default model labels
  const instSttHealth = instSttProvider
    ? providers.find((p) => p.providerId === instSttProvider)
    : providers.find((p) => p.capabilities.stt);
  const instTtsHealth = instTtsProvider
    ? providers.find((p) => p.providerId === instTtsProvider)
    : providers.find((p) => p.capabilities.tts);
  const sttModelPlaceholder =
    modelLabel(instSttHealth?.defaults?.sttModel ?? "") || "Server default";
  const ttsModelPlaceholder =
    modelLabel(instTtsHealth?.defaults?.ttsModel ?? "") || "Server default";
  const _ttsVoicePlaceholder =
    modelLabel(instTtsHealth?.defaults?.ttsVoice ?? "") || "Server default";

  return (
    <div className="space-y-6">
      <SttSettingsCard
        isAdmin={isAdmin}
        instanceLoading={instanceLoading}
        instanceSettings={instanceSettings}
        onSettingChange={handleSettingChange}
        isAudioAvailable={isAudioAvailable}
        isCheckingAvailability={isCheckingAvailability}
        checkConnection={checkConnection}
        isStreamingSttEnabled={isStreamingSttEnabled}
        sttProvider={preferences.sttProvider}
        useStreamingSTT={preferences.useStreamingSTT}
        autoSendSTT={preferences.autoSendSTT}
        onAutoSendSTTChange={(checked) =>
          updatePreference("autoSendSTT", checked)
        }
        transcribe={transcribe}
        sttModelPlaceholder={sttModelPlaceholder}
      />

      <TtsSettingsCard
        isAdmin={isAdmin}
        instanceLoading={instanceLoading}
        instanceSettings={instanceSettings}
        onSettingChange={handleSettingChange}
        isAudioAvailable={isAudioAvailable}
        isCheckingAvailability={isCheckingAvailability}
        checkConnection={checkConnection}
        ttsModelPlaceholder={ttsModelPlaceholder}
        autoPlayTTS={preferences.autoPlayTTS}
        onAutoPlayTTSChange={(checked) =>
          updatePreference("autoPlayTTS", checked)
        }
        activeTtsProvider={activeTtsProvider}
        ttsOpts={ttsOpts}
        ttsModel={preferences.ttsModel}
        ttsVoice={preferences.ttsVoice}
        ttsSpeed={preferences.ttsSpeed}
        onTtsVoiceChange={(val) => updatePreference("ttsVoice", val)}
        onTtsSpeedChange={(val) => updatePreference("ttsSpeed", val)}
        ttsDefaults={ttsDefaults}
        synthesize={synthesize}
        isSynthesizing={isSynthesizing}
      />
    </div>
  );
}
