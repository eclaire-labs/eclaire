import { Loader2, Play, RefreshCw, Volume2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

import type { ProviderOptions, SelectOption } from "../audio-helpers";
import {
  isTtsSpeedSupported,
  OptionSelect,
  PROVIDER_OPTIONS,
  providerLabel,
  SPEED_STEPS,
  TtsVoiceField,
} from "../audio-helpers";
import { AdminConfigSection } from "./AdminConfigSection";
import type { InstanceSettings } from "./utils";
import { providerOptions } from "./utils";

/** Return TTS model options filtered by provider (or all if no provider set) */
function ttsModelOptionsForProvider(providerId: string): SelectOption[] {
  if (providerId && PROVIDER_OPTIONS[providerId]) {
    return PROVIDER_OPTIONS[providerId].ttsModels ?? [];
  }
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

interface TtsSettingsCardProps {
  isAdmin: boolean;
  instanceLoading: boolean;
  instanceSettings: InstanceSettings;
  onSettingChange: (key: string, value: unknown) => void;
  isAudioAvailable: boolean;
  isCheckingAvailability: boolean;
  checkConnection: () => void;
  ttsModelPlaceholder: string;
  autoPlayTTS: boolean;
  onAutoPlayTTSChange: (checked: boolean) => void;
  activeTtsProvider: string;
  ttsOpts: ProviderOptions | undefined;
  ttsModel: string;
  ttsVoice: string;
  ttsSpeed: number;
  onTtsVoiceChange: (val: string) => void;
  onTtsSpeedChange: (val: number) => void;
  ttsDefaults: { ttsModel?: string; ttsVoice?: string } | null;
  synthesize: (text: string) => Promise<string>;
  isSynthesizing: boolean;
}

export function TtsSettingsCard({
  isAdmin,
  instanceLoading,
  instanceSettings,
  onSettingChange,
  isAudioAvailable,
  isCheckingAvailability,
  checkConnection,
  ttsModelPlaceholder,
  autoPlayTTS,
  onAutoPlayTTSChange,
  activeTtsProvider,
  ttsOpts,
  ttsModel,
  ttsVoice,
  ttsSpeed,
  onTtsVoiceChange,
  onTtsSpeedChange,
  ttsDefaults,
  synthesize,
  isSynthesizing,
}: TtsSettingsCardProps) {
  const [testStatus, setTestStatus] = useState<
    "idle" | "synthesizing" | "playing"
  >("idle");
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleTestVoice = useCallback(async () => {
    if (testStatus !== "idle") {
      if (testAudioRef.current) {
        testAudioRef.current.pause();
        testAudioRef.current = null;
      }
      setTestStatus("idle");
      return;
    }

    setTestStatus("synthesizing");
    try {
      const url = await synthesize(
        "Hello! This is a test of the selected voice and speech settings.",
      );
      const audio = new Audio(url);
      testAudioRef.current = audio;
      audio.onended = () => {
        testAudioRef.current = null;
        setTestStatus("idle");
      };
      audio.onerror = () => {
        testAudioRef.current = null;
        setTestStatus("idle");
      };
      setTestStatus("playing");
      await audio.play();
    } catch {
      toast.error("Voice test failed");
      setTestStatus("idle");
    }
  }, [testStatus, synthesize]);

  // Instance-level values for admin controls
  const instTtsProvider =
    (instanceSettings["audio.defaultTtsProvider"] as string) ?? "";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Text-to-Speech
            </CardTitle>
            <CardDescription>
              Configure how assistant responses are spoken.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isCheckingAvailability ? (
              <Badge variant="outline" className="gap-1.5 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking
              </Badge>
            ) : isAudioAvailable ? (
              <Badge
                variant="outline"
                className="gap-1.5 border-green-500/30 bg-green-500/10 text-xs text-green-600 dark:text-green-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Connected
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1.5 border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                Not connected
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={checkConnection}
              disabled={isCheckingAvailability}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isCheckingAvailability ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Admin config zone */}
        <AdminConfigSection
          isAdmin={isAdmin}
          loading={instanceLoading}
          readOnlyBadges={[
            {
              label: "Provider",
              value: providerLabel(instTtsProvider) || "Not configured",
            },
            {
              label: "Model",
              value:
                (instanceSettings["audio.defaultTtsModel"] as string) ||
                "Default",
            },
            {
              label: "Streaming",
              value:
                (instanceSettings["audio.useStreamingTts"] as boolean) !== false
                  ? "On"
                  : "Off",
            },
          ]}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <OptionSelect
              id="default-tts-provider"
              label="Provider"
              options={providerOptions("tts")}
              value={instTtsProvider}
              onChange={(val) =>
                onSettingChange("audio.defaultTtsProvider", val)
              }
              placeholder="Select a provider"
              hideDefault
              hideCustom
              autoSelectFirst={false}
            />
            {!PROVIDER_OPTIONS[instTtsProvider]?.hideTTSModel && (
              <OptionSelect
                id="default-tts-model"
                label="Model"
                options={ttsModelOptionsForProvider(instTtsProvider)}
                value={
                  (instanceSettings["audio.defaultTtsModel"] as string) ?? ""
                }
                onChange={(val) =>
                  onSettingChange("audio.defaultTtsModel", val)
                }
                placeholder={ttsModelPlaceholder}
                hideDefault
              />
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="streaming-tts" className="text-sm">
                Streaming
              </Label>
              <p className="text-xs text-muted-foreground">
                Enable streaming speech synthesis for faster playback start
                (requires provider support).
              </p>
            </div>
            <Switch
              id="streaming-tts"
              checked={
                (instanceSettings["audio.useStreamingTts"] as boolean) ?? true
              }
              onCheckedChange={(checked) =>
                onSettingChange("audio.useStreamingTts", checked)
              }
            />
          </div>
        </AdminConfigSection>

        <Separator />

        {/* User options */}
        <div className="space-y-4">
          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-3">
              <Play className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="auto-play-tts" className="text-sm font-normal">
                  Auto-play responses
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatically play assistant responses as audio. Interrupt
                  playback by holding the PTT button.
                </p>
              </div>
            </div>
            <Switch
              id="auto-play-tts"
              checked={autoPlayTTS}
              onCheckedChange={(checked) => onAutoPlayTTSChange(checked)}
            />
          </div>

          <div className="space-y-3">
            <div>
              <TtsVoiceField
                activeTtsProvider={activeTtsProvider}
                ttsOpts={ttsOpts}
                ttsModel={ttsModel}
                ttsModelDefault={ttsDefaults?.ttsModel}
                ttsVoice={ttsVoice}
                ttsVoiceDefault={ttsDefaults?.ttsVoice}
                onChange={(val) => onTtsVoiceChange(val)}
              />
            </div>

            {isTtsSpeedSupported(
              activeTtsProvider,
              ttsModel || ttsDefaults?.ttsModel || "",
            ) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-normal">Speech speed</Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {ttsSpeed.toFixed(2)}x
                  </span>
                </div>
                <Slider
                  value={[
                    SPEED_STEPS.indexOf(ttsSpeed) !== -1
                      ? SPEED_STEPS.indexOf(ttsSpeed)
                      : 2,
                  ]}
                  onValueChange={([idx]) =>
                    onTtsSpeedChange(SPEED_STEPS[idx ?? 2] ?? 1.0)
                  }
                  min={0}
                  max={SPEED_STEPS.length - 1}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>0.5x</span>
                  <span>1x</span>
                  <span>1.5x</span>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!isAudioAvailable || isSynthesizing}
              onClick={handleTestVoice}
            >
              {testStatus === "synthesizing" ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Generating...
                </>
              ) : testStatus === "playing" ? (
                <>
                  <Volume2 className="mr-2 h-3.5 w-3.5" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="mr-2 h-3.5 w-3.5" />
                  Test voice
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
