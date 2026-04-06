import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetupPresets } from "@/hooks/use-onboarding";
import { apiPost } from "@/lib/api-client";
import type { StepProps } from "../SetupWizard";

export function ConfigureProviderStep({
  state,
  onNext,
  onBack,
  isAdvancing,
}: StepProps) {
  const { data: presets } = useSetupPresets();
  const preset = presets?.find((p) => p.id === state.selectedPreset);

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const isCloud = preset?.isCloud ?? false;
  const requiresApiKey = preset?.requiresApiKey ?? false;

  async function handleCreateAndTest() {
    if (!preset) return;
    setIsCreating(true);
    setTestResult(null);

    try {
      // First, apply the preset to create provider(s)
      await apiPost(`/api/onboarding/step/configure_provider`, {
        presetId: preset.id,
        ...(apiKey && { apiKey }),
        ...(baseUrl && { baseUrl }),
      });

      // Then test the first provider
      const providerId =
        preset.providers[0]?.presetId + (preset.providers[0]?.idSuffix ?? "");
      if (providerId) {
        setIsTesting(true);
        try {
          const testRes = await apiPost(
            `/api/admin/providers/${providerId}/test`,
          );
          const result = (await testRes.json()) as {
            success: boolean;
            error?: string;
          };
          setTestResult({ ok: result.success, error: result.error });
          if (result.success) {
            toast.success("Provider connection successful!");
          }
        } catch {
          setTestResult({ ok: false, error: "Connection test failed" });
        }
        setIsTesting(false);
      }
    } catch (error) {
      toast.error("Failed to create provider", {
        description:
          error instanceof Error ? error.message : "Something went wrong",
      });
    } finally {
      setIsCreating(false);
    }
  }

  function handleContinue() {
    onNext({ presetId: state.selectedPreset });
  }

  if (!preset) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No preset selected. Please go back and choose a setup preset.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configure {preset.name}</CardTitle>
        <CardDescription>{preset.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cloud providers need an API key */}
        {requiresApiKey && (
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder={`Enter your ${preset.name} API key`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your API key is encrypted at rest and never shared.
            </p>
          </div>
        )}

        {/* Local providers may need a custom URL */}
        {!isCloud && preset.id !== "custom" && (
          <div className="space-y-3">
            {preset.providers.map((pDef) => (
              <div
                key={pDef.presetId + (pDef.idSuffix ?? "")}
                className="rounded-lg border p-3"
              >
                <p className="text-sm font-medium">
                  {pDef.nameOverride ?? pDef.presetId}
                </p>
                <p className="text-xs text-muted-foreground">
                  Default: http://127.0.0.1:{pDef.portOverride ?? 11434}
                </p>
              </div>
            ))}
            <Alert>
              <AlertDescription className="text-sm">
                Make sure your local AI server is running before testing the
                connection.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Custom preset needs a base URL */}
        {preset.id === "custom" && (
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              placeholder="http://127.0.0.1:8080/v1"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
        )}

        {/* Test result */}
        {testResult && (
          <div
            className={`flex items-center gap-2 rounded-lg border p-3 ${
              testResult.ok
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
            <span className="text-sm">
              {testResult.ok
                ? "Connection successful"
                : testResult.error || "Connection failed"}
            </span>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCreateAndTest}
              disabled={isCreating || isTesting || (requiresApiKey && !apiKey)}
            >
              {isCreating || isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isCreating ? "Creating..." : "Testing..."}
                </>
              ) : (
                "Create & Test"
              )}
            </Button>
            <Button onClick={handleContinue} disabled={isAdvancing}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
