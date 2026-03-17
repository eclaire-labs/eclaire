import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listModels, type ModelSummary } from "@/lib/api-models";
import { useEffect, useRef, useState } from "react";

const SYSTEM_DEFAULT_VALUE = "__system_default__";

type AgentRuntimeKind = "native" | "external_harness";

interface ModelPickerProps {
  value: string | null;
  onChange: (modelId: string | null, runtimeKind: AgentRuntimeKind) => void;
  disabled?: boolean;
}

function getRuntimeKind(
  models: ModelSummary[],
  modelId: string | null,
): AgentRuntimeKind {
  if (!modelId) return "native";
  const model = models.find((m) => m.id === modelId);
  return model?.agentRuntimeKind ?? "native";
}

export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const emittedInitialRef = useRef(false);

  useEffect(() => {
    listModels()
      .then((res) => setModels(res.items))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  // Emit runtime kind for pre-populated value once models are loaded
  useEffect(() => {
    if (models.length > 0 && !emittedInitialRef.current) {
      emittedInitialRef.current = true;
      if (value) {
        onChange(value, getRuntimeKind(models, value));
      }
    }
  }, [models, value, onChange]);

  const grouped = models.reduce<Record<string, ModelSummary[]>>(
    (acc, model) => {
      const key = model.provider;
      if (!acc[key]) acc[key] = [];
      acc[key].push(model);
      return acc;
    },
    {},
  );

  const providers = Object.keys(grouped).sort();

  return (
    <Select
      value={value ?? SYSTEM_DEFAULT_VALUE}
      onValueChange={(v) => {
        const modelId = v === SYSTEM_DEFAULT_VALUE ? null : v;
        onChange(modelId, getRuntimeKind(models, modelId));
      }}
      disabled={disabled || loading}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select a model..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SYSTEM_DEFAULT_VALUE}>System Default</SelectItem>
        {providers.length > 0 && <SelectSeparator />}
        {providers.map((provider) => (
          <SelectGroup key={provider}>
            <SelectLabel>{provider}</SelectLabel>
            {(grouped[provider] ?? []).map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
