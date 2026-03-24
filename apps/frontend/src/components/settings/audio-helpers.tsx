import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AudioProviderHealth } from "@/hooks/use-audio";

// ============================================================================
// Provider metadata
// ============================================================================

export const PROVIDER_LABELS: Record<string, string> = {
  "mlx-audio": "mlx-audio (local)",
  elevenlabs: "ElevenLabs (cloud)",
  "whisper-cpp": "Whisper.cpp (local)",
  "pocket-tts": "Pocket TTS (local)",
};

export interface SelectOption {
  value: string;
  label: string;
}

export interface ProviderOptions {
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
 */
export function isTtsSpeedSupported(provider: string, model: string): boolean {
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
export const SPEED_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5];

/**
 * Voice options vary by TTS model for mlx-audio.
 */
export function getMlxVoiceOptions(ttsModel: string): {
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

/** Resolve a model/voice ID to its display label, or return the ID itself. */
export function modelLabel(value: string): string {
  if (!value) return "";
  for (const opts of Object.values(PROVIDER_OPTIONS)) {
    for (const list of [opts.sttModels, opts.ttsModels, opts.ttsVoices]) {
      const match = list?.find((o) => o.value === value);
      if (match) return match.label;
    }
  }
  return value;
}

export const PROVIDER_OPTIONS: Record<string, ProviderOptions> = {
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
// Shared components
// ============================================================================

const CUSTOM_VALUE = "__custom__";
const DEFAULT_VALUE = "__default__";

export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}

export function ProviderStatusDot({
  provider,
}: {
  provider: AudioProviderHealth;
}) {
  if (provider.status === "ready") {
    return <span className="h-1.5 w-1.5 rounded-full bg-green-500" />;
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-red-500" />;
}

/**
 * A select dropdown with known options + "Default" + "Custom..." fallback.
 */
export function OptionSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
  helpText,
  hideDefault,
  hideCustom,
  autoSelectFirst,
}: {
  id: string;
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  helpText?: string;
  hideDefault?: boolean;
  hideCustom?: boolean;
  /** Auto-select the first option when value is empty. Defaults to `hideDefault`. */
  autoSelectFirst?: boolean;
}) {
  const isKnownOption = value === "" || options.some((o) => o.value === value);
  const [showCustom, setShowCustom] = useState(false);

  // Stable ref for onChange to avoid infinite re-render loops when callers
  // pass inline arrow functions (new reference every render).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Auto-clear stored values that no longer match any known option
  useEffect(() => {
    if (!isKnownOption && value !== "" && !showCustom) {
      onChangeRef.current("");
    }
  }, [isKnownOption, value, showCustom]);

  // When auto-select is enabled and value is empty, pick the first option
  const shouldAutoSelect = autoSelectFirst ?? hideDefault;
  const firstValue = options[0]?.value ?? "";
  useEffect(() => {
    if (shouldAutoSelect && value === "" && firstValue) {
      onChangeRef.current(firstValue);
    }
  }, [shouldAutoSelect, value, firstValue]);

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
          {!hideCustom && (
            <SelectItem value={CUSTOM_VALUE}>Custom...</SelectItem>
          )}
        </SelectContent>
      </Select>
      {showCustom && !hideCustom && (
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
 */
export function TtsVoiceField({
  activeTtsProvider,
  ttsOpts,
  ttsModel,
  ttsModelDefault,
  ttsVoice,
  ttsVoiceDefault,
  onChange,
}: {
  activeTtsProvider: string;
  ttsOpts: ProviderOptions | undefined;
  ttsModel: string;
  ttsModelDefault?: string;
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
    const modelKey = ttsModel || ttsModelDefault || "";
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
          hideDefault
          hideCustom
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
