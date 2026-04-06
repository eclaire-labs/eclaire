import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Loader2, PartyPopper } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCompleteOnboarding } from "@/hooks/use-onboarding";
import type { StepProps } from "../SetupWizard";

export function SummaryStep({ state, onBack }: StepProps) {
  const navigate = useNavigate();
  const completeOnboarding = useCompleteOnboarding();
  const [isComplete, setIsComplete] = useState(state.status === "completed");

  async function handleComplete() {
    try {
      await completeOnboarding.mutateAsync();
      setIsComplete(true);
      toast.success("Setup complete!");
    } catch (error) {
      toast.error("Failed to complete setup", {
        description:
          error instanceof Error ? error.message : "Something went wrong",
      });
    }
  }

  if (isComplete) {
    return (
      <Card>
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-2">
            <PartyPopper className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">You're All Set!</CardTitle>
          <CardDescription className="text-base">
            Eclaire is configured and ready to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
            <p className="font-medium">Suggested next steps:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Save a bookmark to test content processing</li>
              <li>Upload a document to try AI-powered extraction</li>
              <li>Open the assistant to ask a question</li>
            </ul>
          </div>

          <div className="flex justify-center">
            <Button size="lg" onClick={() => navigate({ to: "/dashboard" })}>
              Go to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setup Summary</CardTitle>
        <CardDescription>
          Review your configuration before completing setup.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border divide-y">
          <SummaryRow
            label="Admin Account"
            value="Configured"
            done={state.completedSteps.includes("claim_admin")}
          />
          <SummaryRow
            label="AI Setup Preset"
            value={state.selectedPreset ?? "Not selected"}
            done={state.completedSteps.includes("choose_preset")}
          />
          <SummaryRow
            label="Provider"
            value={
              state.completedSteps.includes("configure_provider")
                ? "Configured"
                : "Not configured"
            }
            done={state.completedSteps.includes("configure_provider")}
          />
          <SummaryRow
            label="Models"
            value={
              state.completedSteps.includes("select_models")
                ? "Selected"
                : "Not selected"
            }
            done={state.completedSteps.includes("select_models")}
          />
          <SummaryRow
            label="Health Check"
            value={
              state.completedSteps.includes("health_check")
                ? "Passed"
                : "Not run"
            }
            done={state.completedSteps.includes("health_check")}
          />
          <SummaryRow
            label="Registration"
            value={
              state.completedSteps.includes("registration_policy")
                ? "Configured"
                : "Not configured"
            }
            done={state.completedSteps.includes("registration_policy")}
          />
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={handleComplete}
            disabled={completeOnboarding.isPending}
          >
            {completeOnboarding.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Completing...
              </>
            ) : (
              "Complete Setup"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  done,
}: {
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        ) : (
          <div className="h-4 w-4 rounded-full border border-muted-foreground/30" />
        )}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  );
}
