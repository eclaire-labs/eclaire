import { Bot, Brain, Info } from "lucide-react";
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
import { useModelCapabilities } from "@/hooks/use-model-capabilities";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";

export default function AssistantSettings() {
  const [preferences, updatePreference, isLoaded] = useAssistantPreferences();
  const {
    data: modelCapabilities,
    loading: modelLoading,
    error: modelError,
  } = useModelCapabilities();

  if (!isLoaded || modelLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Assistant
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

  // Check if thinking is supported by the model (never means not supported)
  const thinkingSupported =
    modelCapabilities?.capabilities?.thinking?.mode !== "never";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          AI Assistant
        </CardTitle>
        <CardDescription>
          Configure how the AI assistant behaves and displays information.
          {modelError && (
            <div className="mt-2 text-sm text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Using default settings (model capabilities unavailable)
            </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Display Options Section */}
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
                    <span className="text-xs text-muted-foreground ml-1">
                      (Not supported)
                    </span>
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Display the AI's internal reasoning and thought process
                  {!thinkingSupported && (
                    <span className="block mt-1 text-yellow-600 dark:text-yellow-400">
                      Current model does not support thinking process display
                    </span>
                  )}
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

        {/* Interface Options Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Interface Options</h4>
            <p className="text-sm text-muted-foreground">
              Control the visibility of interface elements and overlays.
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
