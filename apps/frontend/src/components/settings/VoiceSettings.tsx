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
import {
  isTtsSpeedSupported,
  PROVIDER_OPTIONS,
  providerLabel,
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

  const firstTtsProvider = providers.find((p) => p.capabilities.tts);

  const activeTtsProvider =
    preferences.ttsProvider || firstTtsProvider?.providerId || "";

  const ttsOpts = PROVIDER_OPTIONS[activeTtsProvider];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Voice
        </CardTitle>
        <CardDescription>
          Configure your personal voice preferences.
          {isAdmin && (
            <>
              {" "}
              Provider, model, and streaming settings are configured in{" "}
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
