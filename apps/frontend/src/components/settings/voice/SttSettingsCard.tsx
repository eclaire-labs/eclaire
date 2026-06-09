import { Loader2, Mic, RefreshCw, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useStreamingTranscription } from "@/hooks/use-streaming-transcription";

import type { SelectOption } from "../audio-helpers";
import {
  OptionSelect,
  PROVIDER_OPTIONS,
  providerLabel,
} from "../audio-helpers";
import { AdminConfigSection } from "./AdminConfigSection";
import type { InstanceSettings } from "./utils";
import { providerOptions } from "./utils";

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

interface SttSettingsCardProps {
  isAdmin: boolean;
  instanceLoading: boolean;
  instanceSettings: InstanceSettings;
  onSettingChange: (key: string, value: unknown) => void;
  isAudioAvailable: boolean;
  isCheckingAvailability: boolean;
  checkConnection: () => void;
  isStreamingSttEnabled: boolean;
  sttProvider: string;
  useStreamingSTT: boolean;
  autoSendSTT: boolean;
  onAutoSendSTTChange: (checked: boolean) => void;
  transcribe: (blob: Blob) => Promise<string>;
  sttModelPlaceholder: string;
}

export function SttSettingsCard({
  isAdmin,
  instanceLoading,
  instanceSettings,
  onSettingChange,
  isAudioAvailable,
  isCheckingAvailability,
  checkConnection,
  isStreamingSttEnabled,
  sttProvider,
  useStreamingSTT,
  autoSendSTT,
  onAutoSendSTTChange,
  transcribe,
  sttModelPlaceholder,
}: SttSettingsCardProps) {
  // --- Audio recording & test hooks ---
  const recorder = useAudioRecorder();
  const sttStreaming = useStreamingTranscription({
    sttProvider: sttProvider || undefined,
  });
  const audioLevel = useAudioLevel();

  const useStreamingForTest = isStreamingSttEnabled && useStreamingSTT;

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

  // Instance-level values for admin controls
  const instSttProvider =
    (instanceSettings["audio.defaultSttProvider"] as string) ?? "";

  return (
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
                (instanceSettings["audio.useStreamingStt"] as boolean) !== false
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
                onSettingChange("audio.defaultSttProvider", val)
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
                  onSettingChange("audio.defaultSttModel", val)
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
                onSettingChange("audio.useStreamingStt", checked)
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
                <Label htmlFor="auto-send-stt" className="text-sm font-normal">
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
              checked={autoSendSTT}
              onCheckedChange={(checked) => onAutoSendSTTChange(checked)}
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
  );
}
