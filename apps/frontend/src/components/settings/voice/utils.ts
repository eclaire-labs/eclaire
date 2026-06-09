import type { SelectOption } from "../audio-helpers";
import { PROVIDER_LABELS, PROVIDER_OPTIONS } from "../audio-helpers";

export interface InstanceSettings {
  "audio.defaultSttModel"?: string;
  "audio.defaultTtsModel"?: string;
  "audio.defaultTtsVoice"?: string;
  "audio.defaultSttProvider"?: string;
  "audio.defaultTtsProvider"?: string;
  "audio.useStreamingStt"?: boolean;
  "audio.useStreamingTts"?: boolean;
  [key: string]: unknown;
}

export function providerOptions(filter: "stt" | "tts"): SelectOption[] {
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
