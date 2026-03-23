import { Bot, Brain } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import { useModelCapabilities } from "@/hooks/use-model-capabilities";

export default function AssistantGeneralSettings() {
  const [preferences, updatePreference, isLoaded] = useAssistantPreferences();
  const {
    data: modelCapabilities,
    loading: modelLoading,
    error: _modelError,
  } = useModelCapabilities();

  if (!isLoaded || modelLoading) {
    return (
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
    );
  }

  const thinkingSupported =
    modelCapabilities?.capabilities?.thinking?.mode !== "never";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Assistant
        </CardTitle>
        <CardDescription>
          Configure global assistant display and behavior preferences.
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
                <Label htmlFor="show-thinking" className="text-sm font-normal">
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
      </CardContent>
    </Card>
  );
}
