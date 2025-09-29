"use client";

import { Bot, Brain, Info, Zap } from "lucide-react";
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
import { useModelCapabilities } from "@/hooks/useModelCapabilities";
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

  // Check if streaming is supported by the model
  const streamingSupported = modelCapabilities?.capabilities?.stream ?? true;
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
        {/* Response Mode Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Response Mode</h4>
            <p className="text-sm text-muted-foreground">
              Choose how the AI assistant delivers responses to you.
            </p>
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="flex items-center space-x-3">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <div className="space-y-0.5">
                <Label htmlFor="streaming-mode" className="text-sm font-normal">
                  Streaming responses
                  {!streamingSupported && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (Not supported)
                    </span>
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Show responses as they're generated for faster interaction
                  {!streamingSupported && (
                    <span className="block mt-1 text-yellow-600 dark:text-yellow-400">
                      Current model does not support streaming responses
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Switch
              id="streaming-mode"
              checked={preferences.streamingEnabled}
              onCheckedChange={(checked) =>
                updatePreference("streamingEnabled", checked)
              }
              disabled={!streamingSupported}
            />
          </div>

          <div className="px-2 py-3 bg-muted/50 rounded-md">
            <p className="text-xs text-muted-foreground">
              {preferences.streamingEnabled ? (
                <>
                  <strong>Streaming mode:</strong> Responses appear as they're
                  generated, showing thinking process, tool usage, and live text
                  generation.
                </>
              ) : (
                <>
                  <strong>Non-streaming mode:</strong> Complete responses appear
                  at once after processing, with thinking content displayed
                  separately.
                </>
              )}
            </p>
          </div>
        </div>

        <Separator />

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

        <Separator />

        {/* Information Section */}
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">About Response Modes</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h5 className="text-sm font-medium text-primary">
                Streaming Mode
              </h5>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Real-time response generation</li>
                <li>• Live thinking process display</li>
                <li>• Interactive tool execution</li>
                <li>• Faster perceived response time</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium text-primary">
                Non-Streaming Mode
              </h5>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Complete response at once</li>
                <li>• Thinking content shown separately</li>
                <li>• Better for complex reasoning</li>
                <li>• More reliable for long responses</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
