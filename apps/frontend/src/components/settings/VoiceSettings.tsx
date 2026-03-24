import {
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Send,
  Settings2,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAudio } from "@/hooks/use-audio";
import { useAuth } from "@/hooks/use-auth";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useStreamingTranscription } from "@/hooks/use-streaming-transcription";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import { apiGet, apiPatch } from "@/lib/api-client";
import {
  isTtsSpeedSupported,
  modelLabel,
  OptionSelect,
  PROVIDER_LABELS,
  PROVIDER_OPTIONS,
  providerLabel,
  SPEED_STEPS,
  TtsVoiceField,
} from "./audio-helpers";
import type { SelectOption } from "./audio-helpers";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

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

/** Return STT model options filtered by provider (or all if no provider set) */
function sttModelOptionsForProvider(providerId: string): SelectOption[] {
  if (providerId && PROVIDER_OPTIONS[providerId]) {
    return PROVIDER_OPTIONS[providerId].sttModels ?? [];
  }
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

/** Return TTS voice options filtered by provider (or all if no provider set) */
function ttsVoiceOptionsForProvider(providerId: string): SelectOption[] {
  if (providerId && PROVIDER_OPTIONS[providerId]) {
    return PROVIDER_OPTIONS[providerId].ttsVoices ?? [];
  }
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

// ---------------------------------------------------------------------------
// Admin configuration section (reusable for STT / TTS cards)
// ---------------------------------------------------------------------------

function AdminConfigSection({
  isAdmin,
  loading,
  readOnlyBadges,
  children,
}: {
  isAdmin: boolean;
  loading: boolean;
  readOnlyBadges: { label: string; value: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Workspace configuration
        </span>
        {isAdmin && (
          <Badge variant="outline" className="text-[10px] font-normal">
            Admin
          </Badge>
        )}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading...
        </div>
      ) : isAdmin ? (
        <div className="space-y-4">{children}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {readOnlyBadges.map((b) => (
            <Badge
              key={b.label}
              variant="secondary"
              className="text-xs font-normal"
            >
              {b.label}: {b.value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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

  // --- Audio recording & test hooks ---
  const recorder = useAudioRecorder();
  const sttStreaming = useStreamingTranscription({
    sttProvider: preferences.sttProvider || undefined,
  });
  const audioLevel = useAudioLevel();

  const useStreamingForTest =
    isStreamingSttEnabled && preferences.useStreamingSTT;

  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;

  const [sttTestStatus, setSttTestStatus] = useState<
    "idle" | "recording" | "transcribing"
  >("idle");
  const [sttTestResult, setSttTestResult] = useState<string | null>(null);

  useEffect(() => {
    const stream = useStreamingForTest ? sttStreaming.stream : recorder.stream;
    const active = useStreamingForTest
      ? sttStreaming.status === "streaming"
      : recorder.status === "recording";

    if (active && stream) {
      audioLevelRef.current.startMonitoring(stream);
    } else {
      audioLevelRef.current.stopMonitoring();
    }
  }, [
    useStreamingForTest,
    sttStreaming.status,
    sttStreaming.stream,
    recorder.status,
    recorder.stream,
  ]);

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

  const handleTestMic = useCallback(async () => {
    if (sttTestStatus === "recording") {
      if (useStreamingForTest) {
        setSttTestStatus("transcribing");
        try {
          const text = await sttStreaming.stop();
          setSttTestResult(text?.trim() || "(no speech detected)");
        } catch {
          toast.error("Transcription failed");
          setSttTestResult(null);
        }
        setSttTestStatus("idle");
      } else {
        setSttTestStatus("transcribing");
        try {
          const blob = await recorder.stopRecording();
          if (!blob || blob.size === 0) {
            setSttTestResult("(no audio captured)");
            setSttTestStatus("idle");
            return;
          }
          const text = await transcribe(blob);
          setSttTestResult(text?.trim() || "(no speech detected)");
        } catch {
          toast.error("Transcription failed");
          setSttTestResult(null);
        }
        setSttTestStatus("idle");
      }
    } else {
      setSttTestResult(null);
      setSttTestStatus("recording");
      if (useStreamingForTest) {
        sttStreaming.start();
      } else {
        recorder.startRecording();
      }
    }
  }, [sttTestStatus, useStreamingForTest, sttStreaming, recorder, transcribe]);

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
  const hasVoiceOverride = preferences.ttsVoice !== "";

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
  const ttsVoicePlaceholder =
    modelLabel(instTtsHealth?.defaults?.ttsVoice ?? "") || "Server default";

  return (
    <div className="space-y-6">
      {/* ================================================================= */}
      {/* Speech-to-Text Card                                               */}
      {/* ================================================================= */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Speech-to-Text
              </CardTitle>
              <CardDescription>
                Configure voice input and transcription.
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
                value: providerLabel(instSttProvider) || "Not configured",
              },
              {
                label: "Model",
                value:
                  (instanceSettings["audio.defaultSttModel"] as string) ||
                  "Default",
              },
              {
                label: "Streaming",
                value:
                  (instanceSettings["audio.useStreamingStt"] as boolean) !==
                  false
                    ? "On"
                    : "Off",
              },
            ]}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <OptionSelect
                id="default-stt-provider"
                label="Provider"
                options={providerOptions("stt")}
                value={instSttProvider}
                onChange={(val) =>
                  handleSettingChange("audio.defaultSttProvider", val)
                }
                placeholder="Select a provider"
                hideDefault
                hideCustom
                autoSelectFirst={false}
              />
              {!PROVIDER_OPTIONS[instSttProvider]?.hideSTTModel && (
                <OptionSelect
                  id="default-stt-model"
                  label="Model"
                  options={sttModelOptionsForProvider(instSttProvider)}
                  value={
                    (instanceSettings["audio.defaultSttModel"] as string) ?? ""
                  }
                  onChange={(val) =>
                    handleSettingChange("audio.defaultSttModel", val)
                  }
                  placeholder={sttModelPlaceholder}
                />
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="streaming-stt" className="text-sm">
                  Streaming
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enable real-time streaming transcription (requires provider
                  support).
                </p>
              </div>
              <Switch
                id="streaming-stt"
                checked={
                  (instanceSettings["audio.useStreamingStt"] as boolean) ?? true
                }
                onCheckedChange={(checked) =>
                  handleSettingChange("audio.useStreamingStt", checked)
                }
              />
            </div>
          </AdminConfigSection>

          <Separator />

          {/* User options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between space-x-2">
              <div className="flex items-center space-x-3">
                <Send className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="auto-send-stt"
                    className="text-sm font-normal"
                  >
                    Auto-send transcriptions
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically send transcribed text as a message. Disable to
                    review and edit before sending.
                  </p>
                </div>
              </div>
              <Switch
                id="auto-send-stt"
                checked={preferences.autoSendSTT}
                onCheckedChange={(checked) =>
                  updatePreference("autoSendSTT", checked)
                }
              />
            </div>

            {/* STT test */}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!isAudioAvailable || sttTestStatus === "transcribing"}
                onClick={handleTestMic}
              >
                {sttTestStatus === "recording" ? (
                  <>
                    <Square className="mr-2 h-3.5 w-3.5 fill-current" />
                    Stop recording
                  </>
                ) : sttTestStatus === "transcribing" ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Transcribing...
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-3.5 w-3.5" />
                    Test microphone
                  </>
                )}
              </Button>

              {sttTestStatus === "recording" && (
                <div className="space-y-1">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-75"
                      style={{
                        width: `${Math.round(audioLevel.level * 100)}%`,
                        backgroundColor:
                          audioLevel.level < 0.5
                            ? "#22c55e"
                            : audioLevel.level < 0.8
                              ? "#eab308"
                              : "hsl(var(--destructive))",
                      }}
                    />
                  </div>
                  <p className="text-center text-xs text-muted-foreground">
                    Listening — speak now
                  </p>
                </div>
              )}

              {sttTestStatus === "recording" &&
                useStreamingForTest &&
                sttStreaming.partialText && (
                  <p className="rounded-md border bg-muted/50 p-2 text-sm italic text-muted-foreground">
                    {sttStreaming.partialText}
                  </p>
                )}

              {sttTestResult !== null && sttTestStatus === "idle" && (
                <p className="rounded-md border bg-muted/50 p-2 text-sm">
                  {sttTestResult}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Text-to-Speech Card                                               */}
      {/* ================================================================= */}
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
                label: "Voice",
                value:
                  (instanceSettings["audio.defaultTtsVoice"] as string) ||
                  "Default",
              },
              {
                label: "Streaming",
                value:
                  (instanceSettings["audio.useStreamingTts"] as boolean) !==
                  false
                    ? "On"
                    : "Off",
              },
            ]}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <OptionSelect
                id="default-tts-provider"
                label="Provider"
                options={providerOptions("tts")}
                value={instTtsProvider}
                onChange={(val) =>
                  handleSettingChange("audio.defaultTtsProvider", val)
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
                    handleSettingChange("audio.defaultTtsModel", val)
                  }
                  placeholder={ttsModelPlaceholder}
                />
              )}
              <OptionSelect
                id="default-tts-voice"
                label="Default voice"
                options={ttsVoiceOptionsForProvider(instTtsProvider)}
                value={
                  (instanceSettings["audio.defaultTtsVoice"] as string) ?? ""
                }
                onChange={(val) =>
                  handleSettingChange("audio.defaultTtsVoice", val)
                }
                placeholder={ttsVoicePlaceholder}
              />
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
                  handleSettingChange("audio.useStreamingTts", checked)
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
                  <Label
                    htmlFor="auto-play-tts"
                    className="text-sm font-normal"
                  >
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
                checked={preferences.autoPlayTTS}
                onCheckedChange={(checked) =>
                  updatePreference("autoPlayTTS", checked)
                }
              />
            </div>

            <div className="space-y-3">
              <div>
                <TtsVoiceField
                  activeTtsProvider={activeTtsProvider}
                  ttsOpts={ttsOpts}
                  ttsModel={preferences.ttsModel}
                  ttsVoice={preferences.ttsVoice}
                  ttsVoiceDefault={ttsDefaults?.ttsVoice}
                  onChange={(val) => updatePreference("ttsVoice", val)}
                />
                {hasVoiceOverride && (
                  <button
                    type="button"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => updatePreference("ttsVoice", "")}
                  >
                    <X className="h-3 w-3" />
                    Reset to workspace default
                  </button>
                )}
              </div>

              {isTtsSpeedSupported(
                activeTtsProvider,
                preferences.ttsModel || ttsDefaults?.ttsModel || "",
              ) && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-normal">Speech speed</Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {preferences.ttsSpeed.toFixed(2)}x
                    </span>
                  </div>
                  <Slider
                    value={[
                      SPEED_STEPS.indexOf(preferences.ttsSpeed) !== -1
                        ? SPEED_STEPS.indexOf(preferences.ttsSpeed)
                        : 2,
                    ]}
                    onValueChange={([idx]) =>
                      updatePreference("ttsSpeed", SPEED_STEPS[idx ?? 2] ?? 1.0)
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
    </div>
  );
}
