import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { Bot, Brain, ExternalLink, Info } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ChromeBrowserControlCard from "@/components/settings/ChromeBrowserControlCard";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useModelCapabilities } from "@/hooks/use-model-capabilities";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";

export default function AssistantDisplaySettings() {
  const [preferences, updatePreference, isLoaded] = useAssistantPreferences();
  const {
    data: modelCapabilities,
    loading: modelLoading,
    error: modelError,
  } = useModelCapabilities();

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
        </CardContent>
      </Card>

      <ChromeBrowserControlCard />
    </div>
  );
}
