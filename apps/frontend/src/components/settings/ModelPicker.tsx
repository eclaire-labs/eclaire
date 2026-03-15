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
import { useEffect, useState } from "react";

const SYSTEM_DEFAULT_VALUE = "__system_default__";

interface ModelPickerProps {
  value: string | null;
  onChange: (modelId: string | null) => void;
  disabled?: boolean;
}

export function ModelPicker({ value, onChange, disabled }: ModelPickerProps) {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listModels()
      .then((res) => setModels(res.items))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

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
      onValueChange={(v) => onChange(v === SYSTEM_DEFAULT_VALUE ? null : v)}
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
