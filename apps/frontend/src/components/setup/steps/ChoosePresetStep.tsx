import { ArrowLeft, ArrowRight, Cloud, Monitor } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSetupPresets } from "@/hooks/use-onboarding";
import { cn } from "@/lib/utils";
import type { StepProps } from "../SetupWizard";

export function ChoosePresetStep({
  state,
  onNext,
  onBack,
  isAdvancing,
}: StepProps) {
  const { data: presets, isLoading } = useSetupPresets();
  const [selected, setSelected] = useState<string | null>(state.selectedPreset);

  function handleContinue() {
    if (selected) {
      onNext({ presetId: selected });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose AI Provider</CardTitle>
        <CardDescription>
          Select how you want to power your AI assistant and content processing.
          You can change this later in settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">
            Loading presets...
          </div>
        ) : (
          <div className="grid gap-3">
            {presets?.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelected(preset.id)}
                className={cn(
                  "flex items-start gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50",
                  selected === preset.id &&
                    "border-primary bg-primary/5 ring-1 ring-primary",
                )}
              >
                <div className="shrink-0 mt-0.5">
                  {preset.isCloud ? (
                    <Cloud className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Monitor className="h-5 w-5 text-green-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{preset.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {preset.isCloud ? "Cloud" : "Local"}
                    </Badge>
                    {preset.requiresApiKey && (
                      <Badge variant="secondary" className="text-xs">
                        API Key
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {preset.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={handleContinue} disabled={!selected || isAdvancing}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
