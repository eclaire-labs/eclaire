import {
  ChevronDown,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  OptionSelect,
  PROVIDER_LABELS,
  PROVIDER_OPTIONS,
  providerLabel,
  SPEED_STEPS,
  TtsVoiceField,
} from "./audio-helpers";
import type { SelectOption } from "./audio-helpers";

// ---------------------------------------------------------------------------
// Workspace defaults section (admin-editable, non-admin read-only)
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

function WorkspaceDefaultsAdmin({
  settings,
  onSettingChange,
}: {
  settings: InstanceSettings;
  onSettingChange: (key: string, value: unknown) => void;
}) {
  const sttProvider = (settings["audio.defaultSttProvider"] as string) ?? "";
  const ttsProvider = (settings["audio.defaultTtsProvider"] as string) ?? "";

  const sttProviderOpts = providerOptions("stt");
  const ttsProviderOpts = providerOptions("tts");
  const sttModels = sttModelOptionsForProvider(sttProvider);
  const ttsModels = ttsModelOptionsForProvider(ttsProvider);
  const ttsVoices = ttsVoiceOptionsForProvider(ttsProvider);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <OptionSelect
          id="default-stt-provider"
          label="STT Provider"
          options={sttProviderOpts}
          value={sttProvider}
          onChange={(val) => onSettingChange("audio.defaultSttProvider", val)}
          placeholder="Auto-detect"
        />
        <OptionSelect
          id="default-tts-provider"
          label="TTS Provider"
          options={ttsProviderOpts}
          value={ttsProvider}
          onChange={(val) => onSettingChange("audio.defaultTtsProvider", val)}
          placeholder="Auto-detect"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <OptionSelect
          id="default-stt-model"
          label="STT Model"
          options={sttModels}
          value={(settings["audio.defaultSttModel"] as string) ?? ""}
          onChange={(val) => onSettingChange("audio.defaultSttModel", val)}
          placeholder="Server default"
        />
        <OptionSelect
          id="default-tts-model"
          label="TTS Model"
          options={ttsModels}
          value={(settings["audio.defaultTtsModel"] as string) ?? ""}
          onChange={(val) => onSettingChange("audio.defaultTtsModel", val)}
          placeholder="Server default"
        />
        <OptionSelect
          id="default-tts-voice"
          label="TTS Voice"
          options={ttsVoices}
          value={(settings["audio.defaultTtsVoice"] as string) ?? ""}
          onChange={(val) => onSettingChange("audio.defaultTtsVoice", val)}
          placeholder="Server default"
        />
      </div>

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
              onSettingChange("audio.useStreamingStt", checked)
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
              onSettingChange("audio.useStreamingTts", checked)
            }
          />
        </div>
      </div>
    </div>
  );
}

function WorkspaceDefaultsReadOnly({
  settings,
}: {
  settings: InstanceSettings;
}) {
  const rows: { label: string; value: string }[] = [
    {
      label: "STT provider",
      value:
        providerLabel((settings["audio.defaultSttProvider"] as string) ?? "") ||
        "Auto-detect",
    },
    {
      label: "TTS provider",
      value:
        providerLabel((settings["audio.defaultTtsProvider"] as string) ?? "") ||
        "Auto-detect",
    },
    {
      label: "STT model",
      value: (settings["audio.defaultSttModel"] as string) || "Server default",
    },
    {
      label: "TTS model",
      value: (settings["audio.defaultTtsModel"] as string) || "Server default",
    },
    {
      label: "TTS voice",
      value: (settings["audio.defaultTtsVoice"] as string) || "Server default",
    },
    {
      label: "Streaming STT",
      value:
        (settings["audio.useStreamingStt"] as boolean) !== false
          ? "Enabled"
          : "Disabled",
    },
    {
      label: "Streaming TTS",
      value:
        (settings["audio.useStreamingTts"] as boolean) !== false
          ? "Enabled"
          : "Disabled",
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        These are your workspace defaults. Voice and speed can be customized
        above.
      </p>
      <div className="rounded-md border bg-muted/30 px-3 py-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between py-1.5 text-sm"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkspaceDefaults({ isAdmin }: { isAdmin: boolean }) {
  const [settings, setSettings] = useState<InstanceSettings>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(isAdmin);

  useEffect(() => {
    apiGet("/api/admin/settings")
      .then((res) => res.json())
      .then((data: InstanceSettings) => setSettings(data))
      .catch(() => toast.error("Failed to load workspace defaults"))
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

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between text-left [&[data-state=open]>svg]:rotate-180">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4" />
                Workspace defaults
                {isAdmin && (
                  <Badge variant="outline" className="text-[10px] font-normal">
                    Admin
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {isAdmin
                  ? "Baseline configuration for all users. Changes apply to everyone who hasn't overridden supported fields."
                  : "Baseline audio configuration for this workspace."}
              </CardDescription>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading...
              </div>
            ) : isAdmin ? (
              <WorkspaceDefaultsAdmin
                settings={settings}
                onSettingChange={handleSettingChange}
              />
            ) : (
              <WorkspaceDefaultsReadOnly settings={settings} />
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Personal voice settings
// ---------------------------------------------------------------------------

export default function VoiceSettings() {
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

  if (!isLoaded) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="h-5 w-5" />
              Voice
            </CardTitle>
            <CardDescription>Loading preferences...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const firstTtsProvider = providers.find((p) => p.capabilities.tts);

  const activeTtsProvider =
    preferences.ttsProvider || firstTtsProvider?.providerId || "";

  const ttsOpts = PROVIDER_OPTIONS[activeTtsProvider];

  const hasVoiceOverride = preferences.ttsVoice !== "";

  return (
    <div className="space-y-6">
      {/* Personal settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Voice
          </CardTitle>
          <CardDescription>
            Personal voice preferences for your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Active configuration info */}
          {(preferences.sttProvider || preferences.ttsProvider) && (
            <div className="flex flex-wrap gap-2">
              {preferences.sttProvider && (
                <Badge variant="outline" className="text-xs">
                  STT: {providerLabel(preferences.sttProvider)}
                </Badge>
              )}
              {preferences.ttsProvider && (
                <Badge variant="outline" className="text-xs">
                  TTS: {providerLabel(preferences.ttsProvider)}
                </Badge>
              )}
            </div>
          )}

          {/* STT Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Speech-to-Text (STT)</h4>
                <p className="text-sm text-muted-foreground">
                  Configure how voice input is transcribed.
                </p>
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
                <div className="flex h-5 items-center justify-center gap-0.5">
                  {[0.15, 0.3, 0.5, 0.75].map((threshold, i) => (
                    <div
                      key={threshold}
                      className="w-1 rounded-full transition-all duration-75"
                      style={{
                        height:
                          audioLevel.level > threshold
                            ? `${8 + i * 3}px`
                            : "4px",
                        backgroundColor:
                          audioLevel.level > threshold
                            ? "hsl(var(--destructive))"
                            : "hsl(var(--muted-foreground) / 0.3)",
                      }}
                    />
                  ))}
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

          <Separator />

          {/* TTS Section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Text-to-Speech (TTS)</h4>
              <p className="text-sm text-muted-foreground">
                Configure how assistant responses are spoken.
              </p>
            </div>

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

      {/* Workspace defaults */}
      <WorkspaceDefaults isAdmin={isAdmin} />
    </div>
  );
}
