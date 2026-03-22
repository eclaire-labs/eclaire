import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import {
  Bot,
  Brain,
  ExternalLink,
  Info,
  Loader2,
  Mic,
  Play,
  RefreshCw,
  Send,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ChromeBrowserControlCard from "@/components/settings/ChromeBrowserControlCard";
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
import { useAudio, type AudioProviderHealth } from "@/hooks/use-audio";
import { useModelCapabilities } from "@/hooks/use-model-capabilities";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";

// ============================================================================
// Provider metadata
// ============================================================================

const PROVIDER_LABELS: Record<string, string> = {
  "mlx-audio": "mlx-audio (local)",
  elevenlabs: "ElevenLabs",
  "whisper-cpp": "Whisper.cpp (local)",
  "pocket-tts": "Pocket TTS (local)",
};

interface SelectOption {
  value: string;
  label: string;
}

interface ProviderOptions {
  sttModels?: SelectOption[];
  ttsModels?: SelectOption[];
  ttsVoices?: SelectOption[];
  hideSTTModel?: boolean;
  hideTTSModel?: boolean;
  hideTTSVoice?: boolean;
  voiceHelp?: string;
}

/** Kokoro voice presets grouped by language */
const KOKORO_VOICES: SelectOption[] = [
  // American English — Female
  { value: "af_heart", label: "Heart (EN-US, F)" },
  { value: "af_bella", label: "Bella (EN-US, F)" },
  { value: "af_nova", label: "Nova (EN-US, F)" },
  { value: "af_sky", label: "Sky (EN-US, F)" },
  { value: "af_nicole", label: "Nicole (EN-US, F)" },
  { value: "af_sarah", label: "Sarah (EN-US, F)" },
  // American English — Male
  { value: "am_adam", label: "Adam (EN-US, M)" },
  { value: "am_echo", label: "Echo (EN-US, M)" },
  { value: "am_eric", label: "Eric (EN-US, M)" },
  { value: "am_liam", label: "Liam (EN-US, M)" },
  { value: "am_michael", label: "Michael (EN-US, M)" },
  // British English
  { value: "bf_alice", label: "Alice (EN-GB, F)" },
  { value: "bf_emma", label: "Emma (EN-GB, F)" },
  { value: "bf_lily", label: "Lily (EN-GB, F)" },
  { value: "bm_daniel", label: "Daniel (EN-GB, M)" },
  { value: "bm_george", label: "George (EN-GB, M)" },
  { value: "bm_lewis", label: "Lewis (EN-GB, M)" },
  // Japanese
  { value: "jf_alpha", label: "Alpha (JA, F)" },
  { value: "jm_kumo", label: "Kumo (JA, M)" },
  // Chinese
  { value: "zf_xiaobei", label: "Xiaobei (ZH, F)" },
  { value: "zm_yunxi", label: "Yunxi (ZH, M)" },
];

/** Qwen3-TTS voice presets (CustomVoice variants only — Base has no spk_id) */
const QWEN3_TTS_VOICES: SelectOption[] = [
  { value: "Vivian", label: "Vivian (EN, F)" },
  { value: "Serena", label: "Serena (EN, F)" },
  { value: "Ryan", label: "Ryan (EN, M)" },
  { value: "Aiden", label: "Aiden (EN, M)" },
  { value: "Uncle_Fu", label: "Uncle Fu (ZH, M)" },
  { value: "Dylan", label: "Dylan (ZH-Beijing, M)" },
  { value: "Eric", label: "Eric (ZH-Sichuan, M)" },
];

/**
 * Whether the selected TTS provider + model supports speed control.
 * Based on inspecting each model's implementation in mlx-audio source.
 */
function isTtsSpeedSupported(provider: string, model: string): boolean {
  switch (provider) {
    case "elevenlabs":
      return true;
    case "mlx-audio":
      return model.toLowerCase().includes("kokoro");
    default:
      return false;
  }
}

/** Fixed speed steps: 0.50x to 1.50x in 0.25 increments, 1.0x centered. */
const SPEED_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5];

/**
 * Voice options vary by TTS model for mlx-audio.
 * Kokoro has named presets. Some models (e.g. Soprano) have no voice selection.
 */
function getMlxVoiceOptions(ttsModel: string): {
  voices?: SelectOption[];
  help?: string;
  hide?: boolean;
} {
  const lower = ttsModel.toLowerCase();
  if (lower.includes("kokoro")) {
    return { voices: KOKORO_VOICES };
  }
  if (
    lower.includes("customvoice") &&
    (lower.includes("qwen3-tts") || lower.includes("qwen3_tts"))
  ) {
    return { voices: QWEN3_TTS_VOICES };
  }
  if (lower.includes("soprano")) {
    return { hide: true };
  }
  if (lower.includes("vibevoice")) {
    return {
      voices: [
        { value: "en-Emma_woman", label: "Emma (English, woman)" },
        { value: "en-Carter_man", label: "Carter (English, man)" },
        { value: "en-Davis_man", label: "Davis (English, man)" },
        { value: "en-Frank_man", label: "Frank (English, man)" },
        { value: "en-Grace_woman", label: "Grace (English, woman)" },
        { value: "en-Mike_man", label: "Mike (English, man)" },
      ],
      help: "Voice cache files are loaded from the model's voices/ directory.",
    };
  }
  return {};
}

const PROVIDER_OPTIONS: Record<string, ProviderOptions> = {
  "mlx-audio": {
    sttModels: [
      {
        value: "mlx-community/parakeet-tdt-0.6b-v3",
        label: "Parakeet TDT v3",
      },
      {
        value: "mlx-community/whisper-large-v3-turbo",
        label: "Whisper Large v3 Turbo",
      },
      {
        value: "mlx-community/SenseVoiceSmall",
        label: "SenseVoice Small (50+ langs)",
      },
      {
        value: "mlx-community/Qwen3-ASR-0.6B-8bit",
        label: "Qwen3 ASR 0.6B",
      },
      {
        value: "mlx-community/Voxtral-Mini-3B-2507-bf16",
        label: "Voxtral Mini 3B",
      },
      {
        value: "mlx-community/VibeVoice-ASR-4bit",
        label: "VibeVoice ASR 4-bit (9B, diarization)",
      },
    ],
    ttsModels: [
      { value: "mlx-community/Kokoro-82M-bf16", label: "Kokoro 82M" },
      {
        value: "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16",
        label: "Qwen3 TTS 0.6B CustomVoice",
      },
      {
        value: "mlx-community/VibeVoice-Realtime-0.5B-8bit",
        label: "VibeVoice Realtime 0.5B",
      },
      {
        value: "mlx-community/Soprano-1.1-80M-bf16",
        label: "Soprano 80M",
      },
    ],
    // Voices handled dynamically by getMlxVoiceOptions() based on selected model
  },
  elevenlabs: {
    sttModels: [{ value: "scribe_v1", label: "Scribe v1" }],
    ttsModels: [
      { value: "eleven_multilingual_v2", label: "Multilingual v2" },
      { value: "eleven_turbo_v2_5", label: "Turbo v2.5" },
    ],
    voiceHelp:
      "Enter an ElevenLabs voice ID (find IDs at elevenlabs.io/app/voice-library)",
  },
  "whisper-cpp": {
    hideSTTModel: true,
  },
  "pocket-tts": {
    hideTTSModel: true,
    ttsVoices: [
      { value: "alba", label: "Alba" },
      { value: "marius", label: "Marius" },
      { value: "javert", label: "Javert" },
      { value: "jean", label: "Jean" },
      { value: "fantine", label: "Fantine" },
      { value: "cosette", label: "Cosette" },
      { value: "eponine", label: "Eponine" },
      { value: "azelma", label: "Azelma" },
    ],
  },
};

// ============================================================================
// Helpers
// ============================================================================

const CUSTOM_VALUE = "__custom__";
const DEFAULT_VALUE = "__default__";

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}

function ProviderStatusDot({ provider }: { provider: AudioProviderHealth }) {
  if (provider.status === "ready") {
    return <span className="h-1.5 w-1.5 rounded-full bg-green-500" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-red-500" />;
}

/**
 * A select dropdown with known options + "Default" + "Custom..." fallback.
 * When "Custom..." is selected, shows a text input below.
 */
function OptionSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
  helpText,
  hideDefault,
}: {
  id: string;
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  helpText?: string;
  /** Hide the "Default" option — auto-selects the first option when value is empty. */
  hideDefault?: boolean;
}) {
  const isKnownOption = value === "" || options.some((o) => o.value === value);
  const [showCustom, setShowCustom] = useState(false);

  // Auto-clear stored values that no longer match any known option
  useEffect(() => {
    if (!isKnownOption && value !== "" && !showCustom) {
      onChange("");
    }
  }, [isKnownOption, value, showCustom, onChange]);

  // When hideDefault is set and value is empty, auto-select the first option
  const firstValue = options[0]?.value ?? "";
  useEffect(() => {
    if (hideDefault && value === "" && firstValue) {
      onChange(firstValue);
    }
  }, [hideDefault, value, firstValue, onChange]);

  const selectValue = showCustom
    ? CUSTOM_VALUE
    : isKnownOption && value
      ? value
      : hideDefault
        ? firstValue
        : DEFAULT_VALUE;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
      <Select
        value={selectValue}
        onValueChange={(val) => {
          if (val === CUSTOM_VALUE) {
            setShowCustom(true);
          } else if (val === DEFAULT_VALUE) {
            setShowCustom(false);
            onChange("");
          } else {
            setShowCustom(false);
            onChange(val);
          }
        }}
      >
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={placeholder || "Default"} />
        </SelectTrigger>
        <SelectContent>
          {!hideDefault && (
            <SelectItem value={DEFAULT_VALUE}>
              Default{placeholder ? ` (${placeholder})` : ""}
            </SelectItem>
          )}
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM_VALUE}>Custom...</SelectItem>
        </SelectContent>
      </Select>
      {showCustom && (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter custom value"
          className="h-8 text-sm"
        />
      )}
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  );
}

/**
 * TTS voice field — adapts based on provider and model.
 * mlx-audio voices depend on the selected TTS model (e.g. Kokoro has named presets, Soprano has none).
 */
function TtsVoiceField({
  activeTtsProvider,
  ttsOpts,
  ttsModel,
  ttsVoice,
  ttsVoiceDefault,
  onChange,
}: {
  activeTtsProvider: string;
  ttsOpts: ProviderOptions | undefined;
  ttsModel: string;
  ttsVoice: string;
  ttsVoiceDefault: string | undefined;
  onChange: (val: string) => void;
}) {
  if (ttsOpts?.hideTTSVoice) return null;

  // Static voice list from provider config (e.g., pocket-tts)
  if (ttsOpts?.ttsVoices) {
    return (
      <OptionSelect
        id="tts-voice"
        label="TTS voice"
        options={ttsOpts.ttsVoices}
        value={ttsVoice}
        onChange={onChange}
        placeholder={ttsVoiceDefault}
      />
    );
  }

  // mlx-audio: model-dependent voice options
  if (activeTtsProvider === "mlx-audio") {
    const modelKey = ttsModel || ttsVoiceDefault || "";
    const mlxVoice = getMlxVoiceOptions(modelKey);
    if (mlxVoice.hide) return null;
    if (mlxVoice.voices) {
      return (
        <OptionSelect
          id="tts-voice"
          label="TTS voice"
          options={mlxVoice.voices}
          value={ttsVoice}
          onChange={onChange}
          placeholder={ttsVoiceDefault}
        />
      );
    }
    if (mlxVoice.help) {
      return (
        <div className="space-y-1.5">
          <Label htmlFor="tts-voice" className="text-sm font-normal">
            TTS voice
          </Label>
          <Input
            id="tts-voice"
            value={ttsVoice}
            onChange={(e) => onChange(e.target.value)}
            placeholder={ttsVoiceDefault || "Default"}
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">{mlxVoice.help}</p>
        </div>
      );
    }
  }

  // Fallback: plain text input
  return (
    <div className="space-y-1.5">
      <Label htmlFor="tts-voice" className="text-sm font-normal">
        TTS voice
      </Label>
      <Input
        id="tts-voice"
        value={ttsVoice}
        onChange={(e) => onChange(e.target.value)}
        placeholder={ttsVoiceDefault || "Default"}
        className="h-8 text-sm"
      />
      {ttsOpts?.voiceHelp && (
        <p className="text-xs text-muted-foreground">{ttsOpts.voiceHelp}</p>
      )}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function AssistantDisplaySettings() {
  const [preferences, updatePreference, isLoaded] = useAssistantPreferences();
  const {
    data: modelCapabilities,
    loading: modelLoading,
    error: modelError,
  } = useModelCapabilities();
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
  } = useAudio();

  const [testStatus, setTestStatus] = useState<
    "idle" | "synthesizing" | "playing"
  >("idle");
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleTestVoice = useCallback(async () => {
    if (testStatus !== "idle") {
      // Stop current playback
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

  if (!isLoaded || modelLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Assistant
            </CardTitle>
            <CardDescription>
              {!isLoaded
                ? "Loading preferences..."
                : "Loading model capabilities..."}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const thinkingSupported =
    modelCapabilities?.capabilities?.thinking?.mode !== "never";

  const sttProviders = providers.filter((p) => p.capabilities.stt);
  const ttsProviders = providers.filter((p) => p.capabilities.tts);

  const activeSttProvider =
    preferences.sttProvider || sttProviders[0]?.providerId || "";
  const activeTtsProvider =
    preferences.ttsProvider || ttsProviders[0]?.providerId || "";

  const sttOpts = PROVIDER_OPTIONS[activeSttProvider];
  const ttsOpts = PROVIDER_OPTIONS[activeTtsProvider];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Assistant
          </CardTitle>
          <CardDescription>
            Configure global assistant display preferences. Agent-specific
            prompt, tools, and skills now live in{" "}
            <Link
              to="/agents/$agentId"
              params={{ agentId: DEFAULT_AGENT_ACTOR_ID }}
              className="inline-flex items-center gap-1 underline underline-offset-4"
            >
              Agents
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            .
            {modelError && (
              <div className="mt-2 flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
                <Info className="h-3 w-3" />
                Using default settings (model capabilities unavailable)
              </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Display Options</h4>
              <p className="text-sm text-muted-foreground">
                Control what information is shown during AI interactions.
              </p>
            </div>

            <div className="flex items-center justify-between space-x-2">
              <div className="flex items-center space-x-3">
                <Brain className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <Label
                    htmlFor="show-thinking"
                    className="text-sm font-normal"
                  >
                    Show thinking process
                    {!thinkingSupported && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (Not supported)
                      </span>
                    )}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Display the AI's internal reasoning and thought process
                  </p>
                </div>
              </div>
              <Switch
                id="show-thinking"
                checked={preferences.showThinkingTokens}
                onCheckedChange={(checked) =>
                  updatePreference("showThinkingTokens", checked)
                }
                disabled={!thinkingSupported}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Interface Options</h4>
              <p className="text-sm text-muted-foreground">
                Control the visibility of assistant entry points.
              </p>
            </div>

            <div className="flex items-center justify-between space-x-2">
              <div className="flex items-center space-x-3">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <Label htmlFor="show-overlay" className="text-sm font-normal">
                    Show assistant overlay
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Display the floating assistant button in the bottom-right
                    corner
                  </p>
                </div>
              </div>
              <Switch
                id="show-overlay"
                checked={preferences.showAssistantOverlay}
                onCheckedChange={(checked) =>
                  updatePreference("showAssistantOverlay", checked)
                }
              />
            </div>
          </div>
          <Separator />

          {/* ============================================================ */}
          {/* STT Section                                                   */}
          {/* ============================================================ */}
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
                  <Label
                    htmlFor="streaming-stt"
                    className="text-sm font-normal"
                  >
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
                    onChange={(e) =>
                      updatePreference("sttModel", e.target.value)
                    }
                    placeholder={sttDefaults?.sttModel || "Server default"}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
          </div>

          <Separator />

          {/* ============================================================ */}
          {/* TTS Section                                                   */}
          {/* ============================================================ */}
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
                    // Reset model, voice, and speed — they differ across providers
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
                  <Label
                    htmlFor="streaming-tts"
                    className="text-sm font-normal"
                  >
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
              {!ttsOpts?.hideTTSModel &&
                (ttsOpts?.ttsModels ? (
                  <OptionSelect
                    id="tts-model"
                    label="TTS model"
                    options={ttsOpts.ttsModels}
                    value={preferences.ttsModel}
                    onChange={(val) => {
                      updatePreference("ttsModel", val);
                      // Reset voice when model changes — voice sets differ per model
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
                      // Reset speed when switching to a model that doesn't support it
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
                    <span className="text-xs text-muted-foreground tabular-nums">
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

      <ChromeBrowserControlCard />
    </div>
  );
}
