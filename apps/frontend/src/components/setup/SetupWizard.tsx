import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/shared/logo";
import {
  useAdvanceStep,
  useOnboardingState,
  type OnboardingState,
} from "@/hooks/use-onboarding";
import { SetupProgress } from "./SetupProgress";
import { WelcomeStep } from "./steps/WelcomeStep";
import { ClaimAdminStep } from "./steps/ClaimAdminStep";
import { ChoosePresetStep } from "./steps/ChoosePresetStep";
import { ConfigureProviderStep } from "./steps/ConfigureProviderStep";
import { SelectModelsStep } from "./steps/SelectModelsStep";
import { HealthCheckStep } from "./steps/HealthCheckStep";
import { RegistrationPolicyStep } from "./steps/RegistrationPolicyStep";
import { SummaryStep } from "./steps/SummaryStep";

const STEPS = [
  "welcome",
  "claim_admin",
  "choose_preset",
  "configure_provider",
  "select_models",
  "health_check",
  "registration_policy",
  "summary",
] as const;

const STEP_LABELS: Record<string, string> = {
  welcome: "Welcome",
  claim_admin: "Admin Account",
  choose_preset: "AI Setup",
  configure_provider: "Provider",
  select_models: "Models",
  health_check: "Health Check",
  registration_policy: "Registration",
  summary: "Finish",
};

export interface StepProps {
  state: OnboardingState;
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  isAdvancing: boolean;
}

export default function SetupWizard() {
  const navigate = useNavigate();
  const { data: state, isLoading, refetch } = useOnboardingState();
  const advanceStep = useAdvanceStep();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  // Sync step index with backend state
  useEffect(() => {
    if (state) {
      if (state.status === "completed") {
        navigate({ to: "/dashboard" });
        return;
      }
      const idx = STEPS.indexOf(state.currentStep as (typeof STEPS)[number]);
      if (idx >= 0) {
        setCurrentStepIndex(idx);
      }
    }
  }, [state, navigate]);

  const handleNext = useCallback(
    async (data?: Record<string, unknown>) => {
      const step = STEPS[currentStepIndex];
      if (!step) return;

      const result = await advanceStep.mutateAsync({ step, data });
      if (result.ok) {
        // Move to next step
        if (currentStepIndex < STEPS.length - 1) {
          setCurrentStepIndex((i) => i + 1);
        }
        // Refetch to get updated state
        refetch();
      }
    },
    [currentStepIndex, advanceStep, refetch],
  );

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1);
    }
  }, [currentStepIndex]);

  if (isLoading || !state) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">
          Loading setup...
        </div>
      </div>
    );
  }

  const stepProps: StepProps = {
    state,
    onNext: handleNext,
    onBack: handleBack,
    isAdvancing: advanceStep.isPending,
  };

  const currentStep = STEPS[currentStepIndex];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <Logo />
          <span className="text-sm text-muted-foreground">Setup Wizard</span>
        </div>
      </div>

      {/* Progress */}
      <div className="mx-auto max-w-3xl px-4 py-6">
        <SetupProgress
          steps={STEPS.map((s) => ({
            id: s,
            label: STEP_LABELS[s] ?? s,
          }))}
          currentIndex={currentStepIndex}
          completedSteps={state.completedSteps}
        />
      </div>

      {/* Step Content */}
      <div className="mx-auto max-w-3xl px-4 pb-16">
        {currentStep === "welcome" && <WelcomeStep {...stepProps} />}
        {currentStep === "claim_admin" && <ClaimAdminStep {...stepProps} />}
        {currentStep === "choose_preset" && <ChoosePresetStep {...stepProps} />}
        {currentStep === "configure_provider" && (
          <ConfigureProviderStep {...stepProps} />
        )}
        {currentStep === "select_models" && <SelectModelsStep {...stepProps} />}
        {currentStep === "health_check" && <HealthCheckStep {...stepProps} />}
        {currentStep === "registration_policy" && (
          <RegistrationPolicyStep {...stepProps} />
        )}
        {currentStep === "summary" && <SummaryStep {...stepProps} />}
      </div>
    </div>
  );
}
