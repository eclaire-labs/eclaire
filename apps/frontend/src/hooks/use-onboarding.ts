import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost } from "@/lib/api-client";

// =============================================================================
// Types
// =============================================================================

export interface OnboardingState {
  status: "not_started" | "in_progress" | "completed";
  currentStep: string;
  completedSteps: string[];
  selectedPreset: string | null;
  userCount: number;
  adminExists: boolean;
  completedAt: string | null;
  completedByUserId: string | null;
}

export interface SetupPreset {
  id: string;
  name: string;
  description: string;
  audience: string;
  isCloud: boolean;
  requiresApiKey: boolean;
  providers: Array<{
    presetId: string;
    idSuffix?: string;
    portOverride?: number;
    nameOverride?: string;
  }>;
  recommendedModels?: {
    backend?: { name: string; providerModel: string };
    workers?: { name: string; providerModel: string };
  };
}

export interface HealthCheckResult {
  db: { ok: boolean; error?: string };
  docling: { ok: boolean; error?: string };
  providers: Array<{
    id: string;
    name: string;
    ok: boolean;
    error?: string;
  }>;
  modelSelections: {
    backend: string | null;
    workers: string | null;
  };
}

export interface StepAdvanceResult {
  ok: boolean;
  state: OnboardingState;
  warning?: string;
  error?: string;
}

// =============================================================================
// Query Keys
// =============================================================================

const ONBOARDING_KEY = ["onboarding"] as const;
const ONBOARDING_STATE_KEY = [...ONBOARDING_KEY, "state"] as const;
const ONBOARDING_PRESETS_KEY = [...ONBOARDING_KEY, "presets"] as const;

// =============================================================================
// Hooks
// =============================================================================

/**
 * Fetch onboarding state. Uses a special fetch that doesn't redirect on 401
 * since the onboarding state endpoint is public when no users exist.
 */
async function fetchOnboardingState(): Promise<OnboardingState> {
  const res = await fetch("/api/onboarding/state", {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch onboarding state: ${res.status}`);
  }
  return res.json();
}

export function useOnboardingState(enabled = true) {
  return useQuery({
    queryKey: ONBOARDING_STATE_KEY,
    queryFn: fetchOnboardingState,
    enabled,
    staleTime: 10_000,
    retry: 1,
  });
}

export function useSetupPresets() {
  return useQuery({
    queryKey: ONBOARDING_PRESETS_KEY,
    queryFn: async () => {
      const res = await apiFetch("/api/onboarding/presets");
      const data = (await res.json()) as { items: SetupPreset[] };
      return data.items;
    },
    staleTime: 60_000,
  });
}

export function useAdvanceStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      step,
      data,
    }: {
      step: string;
      data?: Record<string, unknown>;
    }) => {
      const res = await apiPost(`/api/onboarding/step/${step}`, data);
      return (await res.json()) as StepAdvanceResult;
    },
    onSuccess: (result) => {
      queryClient.setQueryData(ONBOARDING_STATE_KEY, result.state);
    },
  });
}

export function useRunHealthCheck() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiPost("/api/onboarding/health-check");
      return (await res.json()) as HealthCheckResult;
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiPost("/api/onboarding/complete");
      return (await res.json()) as OnboardingState;
    },
    onSuccess: (state) => {
      queryClient.setQueryData(ONBOARDING_STATE_KEY, state);
      try {
        sessionStorage.setItem("eclaire_onboarding_complete", "true");
      } catch {
        // sessionStorage unavailable
      }
    },
  });
}

export function useResetOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiPost("/api/onboarding/reset");
      return (await res.json()) as OnboardingState;
    },
    onSuccess: (state) => {
      queryClient.setQueryData(ONBOARDING_STATE_KEY, state);
      try {
        sessionStorage.removeItem("eclaire_onboarding_complete");
      } catch {
        // sessionStorage unavailable
      }
    },
  });
}

/**
 * Quick check for whether onboarding is required.
 * Returns true if user is admin and onboarding is not completed.
 */
export function useIsOnboardingRequired(
  isAdmin: boolean | undefined,
  enabled = true,
) {
  const { data } = useOnboardingState(enabled && !!isAdmin);
  if (!isAdmin || !data) return false;
  return data.status !== "completed";
}
