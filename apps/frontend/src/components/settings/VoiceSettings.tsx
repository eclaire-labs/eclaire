import { Link } from "@tanstack/react-router";
import {
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Send,
  Square,
  Volume2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAudio } from "@/hooks/use-audio";
import { useAuth } from "@/hooks/use-auth";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useStreamingTranscription } from "@/hooks/use-streaming-transcription";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import {
  getMlxVoiceOptions,
  isTtsSpeedSupported,
  OptionSelect,
  PROVIDER_OPTIONS,
  providerLabel,
  ProviderStatusDot,
  SPEED_STEPS,
  TtsVoiceField,
} from "./audio-helpers";

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
    isStreamingTtsEnabled,
    sttDefaults,
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Voice
          </CardTitle>
          <CardDescription>Loading preferences...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sttProviders = providers.filter((p) => p.capabilities.stt);
  const ttsProviders = providers.filter((p) => p.capabilities.tts);

  const activeSttProvider =
    preferences.sttProvider || sttProviders[0]?.providerId || "";
  const activeTtsProvider =
    preferences.ttsProvider || ttsProviders[0]?.providerId || "";

  const sttOpts = PROVIDER_OPTIONS[activeSttProvider];
  const ttsOpts = PROVIDER_OPTIONS[activeTtsProvider];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Voice
        </CardTitle>
        <CardDescription>
          Configure speech-to-text and text-to-speech settings.
          {isAdmin && (
            <>
              {" "}
              Instance defaults can be configured in{" "}
              <Link
                to="/settings/$section"
                params={{ section: "voice-defaults" }}
                className="underline hover:text-foreground"
              >
                Voice Defaults
              </Link>
              .
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

          {sttProviders.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="stt-provider" className="text-sm font-normal">
                Provider
              </Label>
              <Select
                value={preferences.sttProvider || sttProviders[0]?.providerId}
                onValueChange={(val) => updatePreference("sttProvider", val)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sttProviders.map((p) => (
                    <SelectItem key={p.providerId} value={p.providerId}>
                      <div className="flex items-center gap-2">
                        <ProviderStatusDot provider={p} />
                        {providerLabel(p.providerId)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-3">
              <Mic className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="streaming-stt" className="text-sm font-normal">
                  Streaming transcription
                  {!isStreamingSttEnabled && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (Not available)
                    </span>
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Stream audio in real-time for live transcription while
                  speaking. Disable to use the simpler record-then-transcribe
                  mode.
                </p>
              </div>
            </div>
            <Switch
              id="streaming-stt"
              checked={preferences.useStreamingSTT}
              onCheckedChange={(checked) =>
                updatePreference("useStreamingSTT", checked)
              }
              disabled={!isStreamingSttEnabled}
            />
          </div>

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
              checked={preferences.autoSendSTT}
              onCheckedChange={(checked) =>
                updatePreference("autoSendSTT", checked)
              }
            />
          </div>

          {!sttOpts?.hideSTTModel &&
            (sttOpts?.sttModels ? (
              <OptionSelect
                id="stt-model"
                label="STT model"
                options={sttOpts.sttModels}
                value={preferences.sttModel}
                onChange={(val) => updatePreference("sttModel", val)}
                placeholder={sttDefaults?.sttModel}
              />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="stt-model" className="text-sm font-normal">
                  STT model
                </Label>
                <Input
                  id="stt-model"
                  value={preferences.sttModel}
                  onChange={(e) => updatePreference("sttModel", e.target.value)}
                  placeholder={sttDefaults?.sttModel || "Server default"}
                  className="h-8 text-sm"
                />
              </div>
            ))}

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
                        audioLevel.level > threshold ? `${8 + i * 3}px` : "4px",
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

          {ttsProviders.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="tts-provider" className="text-sm font-normal">
                Provider
              </Label>
              <Select
                value={preferences.ttsProvider || ttsProviders[0]?.providerId}
                onValueChange={(val) => {
                  updatePreference("ttsProvider", val);
                  updatePreference("ttsModel", "");
                  updatePreference("ttsVoice", "");
                  updatePreference("ttsSpeed", 1.0);
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ttsProviders.map((p) => (
                    <SelectItem key={p.providerId} value={p.providerId}>
                      <div className="flex items-center gap-2">
                        <ProviderStatusDot provider={p} />
                        {providerLabel(p.providerId)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-3">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="streaming-tts" className="text-sm font-normal">
                  Streaming speech synthesis
                  {!isStreamingTtsEnabled && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (Not available)
                    </span>
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Start playing audio as it's generated for faster response.
                  Disable to wait for full synthesis before playback.
                </p>
              </div>
            </div>
            <Switch
              id="streaming-tts"
              checked={preferences.useStreamingTTS}
              onCheckedChange={(checked) =>
                updatePreference("useStreamingTTS", checked)
              }
              disabled={!isStreamingTtsEnabled}
            />
          </div>

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
              checked={preferences.autoPlayTTS}
              onCheckedChange={(checked) =>
                updatePreference("autoPlayTTS", checked)
              }
            />
          </div>

          <div className="space-y-3">
            {!ttsOpts?.hideTTSModel &&
              (ttsOpts?.ttsModels ? (
                <OptionSelect
                  id="tts-model"
                  label="TTS model"
                  options={ttsOpts.ttsModels}
                  value={preferences.ttsModel}
                  onChange={(val) => {
                    updatePreference("ttsModel", val);
                    const newVoices = getMlxVoiceOptions(val);
                    if (
                      newVoices.voices &&
                      !newVoices.voices.some(
                        (v) => v.value === preferences.ttsVoice,
                      )
                    ) {
                      updatePreference(
                        "ttsVoice",
                        newVoices.voices[0]?.value ?? "",
                      );
                    } else if (!newVoices.voices && preferences.ttsVoice) {
                      updatePreference("ttsVoice", "");
                    }
                    if (
                      !isTtsSpeedSupported(activeTtsProvider, val) &&
                      preferences.ttsSpeed !== 1.0
                    ) {
                      updatePreference("ttsSpeed", 1.0);
                    }
                  }}
                  placeholder={ttsDefaults?.ttsModel}
                  hideDefault
                />
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="tts-model" className="text-sm font-normal">
                    TTS model
                  </Label>
                  <Input
                    id="tts-model"
                    value={preferences.ttsModel}
                    onChange={(e) => {
                      updatePreference("ttsModel", e.target.value);
                      const newVoices = getMlxVoiceOptions(e.target.value);
                      if (
                        newVoices.voices &&
                        !newVoices.voices.some(
                          (v) => v.value === preferences.ttsVoice,
                        )
                      ) {
                        updatePreference(
                          "ttsVoice",
                          newVoices.voices[0]?.value ?? "",
                        );
                      } else if (!newVoices.voices && preferences.ttsVoice) {
                        updatePreference("ttsVoice", "");
                      }
                    }}
                    placeholder={ttsDefaults?.ttsModel || "Server default"}
                    className="h-8 text-sm"
                  />
                </div>
              ))}

            <TtsVoiceField
              activeTtsProvider={activeTtsProvider}
              ttsOpts={ttsOpts}
              ttsModel={preferences.ttsModel}
              ttsVoice={preferences.ttsVoice}
              ttsVoiceDefault={ttsDefaults?.ttsVoice}
              onChange={(val) => updatePreference("ttsVoice", val)}
            />

            {isTtsSpeedSupported(
              activeTtsProvider,
              preferences.ttsModel || ttsDefaults?.ttsModel || "",
            ) && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-normal">TTS speed</Label>
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
  );
}
