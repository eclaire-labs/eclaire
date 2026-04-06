/**
 * Onboarding Engine
 *
 * Shared onboarding state machine used by both the web wizard and CLI.
 * Step completion is computed from real system state, not user clicks,
 * making the flow resumable, idempotent, and tolerant of out-of-band changes.
 */

import { count, eq } from "drizzle-orm";
import type { Dialect, ProviderConfig } from "@eclaire/ai";
import { config as appConfig } from "../../config/index.js";
import { db, schema } from "../../db/index.js";
import { createChildLogger } from "../logger.js";
import {
  createProvider,
  getProvider,
  importModels,
  listModels,
  listProviders,
  getAllSelections,
  testProviderConnection,
} from "./ai-config.js";
import { getProviderPresetById } from "./ai-provider-presets.js";
import {
  getAllInstanceSettings,
  getInstanceSetting,
  setInstanceSetting,
  setInstanceSettings,
} from "./instance-settings.js";

const logger = createChildLogger("services:onboarding");

// =============================================================================
// Types
// =============================================================================

export const ONBOARDING_STEPS = [
  "welcome",
  "claim_admin",
  "choose_preset",
  "configure_provider",
  "select_models",
  "health_check",
  "registration_policy",
  "summary",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStatus = "not_started" | "in_progress" | "completed";

export interface OnboardingState {
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  selectedPreset: string | null;
  userCount: number;
  adminExists: boolean;
  completedAt: string | null;
  completedByUserId: string | null;
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

export interface SetupPreset {
  id: string;
  name: string;
  description: string;
  audience: string;
  isCloud: boolean;
  requiresApiKey: boolean;
  /** Provider preset IDs to create (1 or 2) */
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

export interface StepAdvanceResult {
  ok: boolean;
  state: OnboardingState;
  warning?: string;
  error?: string;
}

// =============================================================================
// Setup Presets
// =============================================================================

const SETUP_PRESETS: SetupPreset[] = [
  {
    id: "llama-cpp-dual",
    name: "llama.cpp (dual model)",
    description:
      "Two local llama.cpp servers: one for the assistant, one for content processing. Best for dedicated GPU setups.",
    audience: "Users running local GPU-backed inference",
    isCloud: false,
    requiresApiKey: false,
    providers: [
      {
        presetId: "llama-cpp",
        idSuffix: "-backend",
        portOverride: 11500,
        nameOverride: "llama.cpp (backend)",
      },
      {
        presetId: "llama-cpp",
        idSuffix: "-workers",
        portOverride: 11501,
        nameOverride: "llama.cpp (workers)",
      },
    ],
  },
  {
    id: "ollama-single",
    name: "Ollama",
    description:
      "Single Ollama server for both assistant and processing. Simple local setup.",
    audience: "Users with Ollama already installed",
    isCloud: false,
    requiresApiKey: false,
    providers: [{ presetId: "ollama" }],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description:
      "Cloud API with access to many models. Fastest setup — just add an API key.",
    audience: "Users wanting cloud-based inference",
    isCloud: true,
    requiresApiKey: true,
    providers: [{ presetId: "openrouter" }],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "OpenAI API (GPT-4, etc.). Requires an OpenAI API key.",
    audience: "Users with existing OpenAI API access",
    isCloud: true,
    requiresApiKey: true,
    providers: [{ presetId: "openai" }],
  },
  {
    id: "custom",
    name: "Custom",
    description:
      "Manually configure providers and models. For advanced setups or unsupported providers.",
    audience: "Advanced operators",
    isCloud: false,
    requiresApiKey: false,
    providers: [],
  },
];

// =============================================================================
// State Evaluation
// =============================================================================

/**
 * Get the full onboarding state by evaluating real system state.
 */
export async function getOnboardingState(): Promise<OnboardingState> {
  const [settings, userCount, adminExists] = await Promise.all([
    getAllInstanceSettings(),
    countUsers(),
    hasAdmin(),
  ]);

  const status =
    (settings["onboarding.status"] as OnboardingStatus) ?? "not_started";
  const selectedPreset =
    (settings["onboarding.selectedPreset"] as string) ?? null;
  const completedAt = (settings["onboarding.completedAt"] as string) ?? null;
  const completedByUserId =
    (settings["onboarding.completedByUserId"] as string) ?? null;

  if (status === "completed") {
    return {
      status: "completed",
      currentStep: "summary",
      completedSteps: [...ONBOARDING_STEPS],
      selectedPreset,
      userCount,
      adminExists,
      completedAt,
      completedByUserId,
    };
  }

  // Evaluate each step from real state
  const completedSteps: OnboardingStep[] = [];
  let currentStep: OnboardingStep = "welcome";

  for (const step of ONBOARDING_STEPS) {
    const isComplete = await evaluateStepCompletion(step, settings);
    if (isComplete) {
      completedSteps.push(step);
    } else {
      currentStep = step;
      break;
    }
  }

  // If all steps are complete but status wasn't set, the current step is summary
  if (completedSteps.length === ONBOARDING_STEPS.length) {
    currentStep = "summary";
  }

  const derivedStatus: OnboardingStatus =
    completedSteps.length === 0 ? "not_started" : "in_progress";

  return {
    status: derivedStatus,
    currentStep,
    completedSteps,
    selectedPreset,
    userCount,
    adminExists,
    completedAt,
    completedByUserId,
  };
}

/**
 * Evaluate whether a single step is complete based on real system state.
 */
async function evaluateStepCompletion(
  step: OnboardingStep,
  settings: Record<string, unknown>,
): Promise<boolean> {
  switch (step) {
    case "welcome":
      return true; // Always complete

    case "claim_admin":
      return await hasAdmin();

    case "choose_preset":
      return typeof settings["onboarding.selectedPreset"] === "string";

    case "configure_provider": {
      const providers = await listProviders();
      return providers.length > 0;
    }

    case "select_models": {
      const [models, selections] = await Promise.all([
        listModels(),
        getAllSelections(),
      ]);
      return models.length > 0 && "backend" in selections;
    }

    case "health_check":
      // Health check is evaluated on demand — the step is considered
      // "complete" once the user has run it at least once and the critical
      // checks (DB + at least one provider) passed. We don't store a flag
      // because health is ephemeral. Instead, treat it as complete if the
      // later steps (registration_policy) have been reached.
      return settings["instance.registrationEnabled"] !== undefined;

    case "registration_policy":
      return settings["instance.registrationEnabled"] !== undefined;

    case "summary":
      return settings["onboarding.status"] === "completed";

    default:
      return false;
  }
}

// =============================================================================
// Step Advancement
// =============================================================================

/**
 * Advance a specific onboarding step with the provided data.
 */
export async function advanceStep(
  step: OnboardingStep,
  data: Record<string, unknown>,
  userId: string | null,
): Promise<StepAdvanceResult> {
  try {
    switch (step) {
      case "welcome":
        // No-op, welcome is always complete
        break;

      case "claim_admin":
        // Handled by registration flow — just re-evaluate
        break;

      case "choose_preset": {
        const presetId = data.presetId as string;
        if (!presetId) {
          return {
            ok: false,
            state: await getOnboardingState(),
            error: "presetId is required",
          };
        }
        const preset = getSetupPresetById(presetId);
        if (!preset) {
          return {
            ok: false,
            state: await getOnboardingState(),
            error: `Unknown preset: ${presetId}`,
          };
        }

        // Check if providers already exist (user might be changing preset)
        const existingProviders = await listProviders();
        let warning: string | undefined;
        if (existingProviders.length > 0) {
          warning =
            "Changing preset will not remove existing providers. Remove them manually if needed.";
        }

        await setInstanceSettings(
          {
            "onboarding.selectedPreset": presetId,
            "onboarding.status": "in_progress",
            "onboarding.currentStep": "configure_provider",
          },
          userId ?? undefined,
        );

        const state = await getOnboardingState();
        return { ok: true, state, warning };
      }

      case "configure_provider": {
        // The caller can either pass provider config directly or use the preset
        const presetId = data.presetId as string | undefined;
        if (presetId) {
          await applySetupPreset(presetId, data, userId ?? undefined);
        }
        // If no presetId, the caller is expected to have created providers
        // via the admin API directly. We just re-evaluate.
        break;
      }

      case "select_models":
        // Model import/selection is done via admin API.
        // This step just re-evaluates.
        break;

      case "health_check":
        // Health check doesn't persist — it's evaluated on demand.
        // Advance past it by updating the currentStep hint.
        await setInstanceSetting(
          "onboarding.currentStep",
          "registration_policy",
          userId ?? undefined,
        );
        break;

      case "registration_policy": {
        const registrationEnabled = data.registrationEnabled;
        if (typeof registrationEnabled !== "boolean") {
          return {
            ok: false,
            state: await getOnboardingState(),
            error: "registrationEnabled (boolean) is required",
          };
        }
        await setInstanceSetting(
          "instance.registrationEnabled",
          registrationEnabled,
          userId ?? undefined,
        );
        break;
      }

      case "summary":
        await completeOnboarding(userId);
        break;
    }

    const state = await getOnboardingState();
    return { ok: true, state };
  } catch (error) {
    logger.error(
      { step, error: error instanceof Error ? error.message : String(error) },
      "Failed to advance onboarding step",
    );
    const state = await getOnboardingState();
    return {
      ok: false,
      state,
      error: error instanceof Error ? error.message : "Step failed",
    };
  }
}

// =============================================================================
// Preset Application
// =============================================================================

/**
 * Apply a setup preset: create provider(s) from the preset definition.
 */
export async function applySetupPreset(
  presetId: string,
  overrides: Record<string, unknown>,
  userId?: string,
): Promise<void> {
  const setupPreset = getSetupPresetById(presetId);
  if (!setupPreset) {
    throw new Error(`Unknown setup preset: ${presetId}`);
  }

  for (const providerDef of setupPreset.providers) {
    const basePreset = getProviderPresetById(providerDef.presetId);
    if (!basePreset) continue;

    const providerId = `${providerDef.presetId}${providerDef.idSuffix ?? ""}`;

    // Skip if provider already exists
    const existing = await getProvider(providerId);
    if (existing) continue;

    // Build the base URL with port override
    let baseUrl = basePreset.config.baseUrl;
    if (providerDef.portOverride) {
      const url = new URL(baseUrl);
      url.port = String(providerDef.portOverride);
      baseUrl = url.toString().replace(/\/$/, "");
    }

    // Apply API key override from request data
    let auth = basePreset.config.auth as ProviderConfig["auth"];
    if (overrides.apiKey && typeof overrides.apiKey === "string") {
      auth = {
        ...auth,
        type: auth?.type ?? "bearer",
        value: overrides.apiKey,
      } as ProviderConfig["auth"];
    }

    // Apply base URL override from request data
    if (overrides.baseUrl && typeof overrides.baseUrl === "string") {
      baseUrl = overrides.baseUrl;
    }

    const providerConfig: ProviderConfig = {
      dialect: basePreset.config.dialect as Dialect,
      baseUrl,
      auth,
      headers: basePreset.config.headers,
      engine: basePreset.defaultEngine
        ? {
            managed: false,
            name: basePreset.defaultEngine.name,
            gpuLayers: basePreset.defaultEngine.gpuLayers,
          }
        : undefined,
    };

    await createProvider(providerId, providerConfig, userId);
    logger.info(
      { providerId, presetId: providerDef.presetId },
      "Created provider from setup preset",
    );
  }
}

// =============================================================================
// Health Checks
// =============================================================================

/**
 * Run onboarding health checks against real services.
 */
export async function runHealthChecks(): Promise<HealthCheckResult> {
  const [dbCheck, doclingCheck, providerChecks, selections] = await Promise.all(
    [checkDb(), checkDocling(), checkProviders(), getAllSelections()],
  );

  return {
    db: dbCheck,
    docling: doclingCheck,
    providers: providerChecks,
    modelSelections: {
      backend: selections.backend ?? null,
      workers: selections.workers ?? null,
    },
  };
}

async function checkDb(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.select({ n: count() }).from(schema.users);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Database unreachable",
    };
  }
}

async function checkDocling(): Promise<{ ok: boolean; error?: string }> {
  try {
    const doclingUrl = appConfig.services.doclingUrl;
    const response = await fetch(`${doclingUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return { ok: response.ok };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Docling unreachable",
    };
  }
}

async function checkProviders(): Promise<
  Array<{ id: string; name: string; ok: boolean; error?: string }>
> {
  const providers = await listProviders();
  const results = await Promise.allSettled(
    providers.map(async (p) => {
      const result = await testProviderConnection(p.id);
      return {
        id: p.id,
        name: (p as Record<string, unknown>).name?.toString?.() ?? p.id,
        ok: result.success,
        error: result.error,
      };
    }),
  );
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          id: "unknown",
          name: "unknown",
          ok: false,
          error: r.reason?.message ?? "Check failed",
        },
  );
}

// =============================================================================
// Completion
// =============================================================================

/**
 * Mark onboarding as complete.
 */
export async function completeOnboarding(userId: string | null): Promise<void> {
  await setInstanceSettings(
    {
      "onboarding.status": "completed",
      "onboarding.completedAt": new Date().toISOString(),
      "onboarding.completedByUserId": userId ?? "",
      "onboarding.currentStep": "summary",
    },
    userId ?? undefined,
  );
  logger.info({ userId }, "Onboarding completed");
}

/**
 * Reset onboarding state so the wizard can be re-run.
 * Does NOT delete providers, models, or other config — only resets
 * the onboarding.* tracking keys.
 */
export async function resetOnboarding(userId: string): Promise<void> {
  await setInstanceSettings(
    {
      "onboarding.status": "not_started",
      "onboarding.currentStep": "welcome",
      "onboarding.selectedPreset": "",
      "onboarding.completedAt": "",
      "onboarding.completedByUserId": "",
    },
    userId,
  );
  logger.info({ userId }, "Onboarding reset");
}

// =============================================================================
// Presets
// =============================================================================

export function getSetupPresets(): SetupPreset[] {
  return SETUP_PRESETS;
}

export function getSetupPresetById(id: string): SetupPreset | undefined {
  return SETUP_PRESETS.find((p) => p.id === id);
}

// =============================================================================
// Upgrade Helper
// =============================================================================

/**
 * Auto-complete onboarding for existing instances that already have
 * providers and models configured. Prevents showing the wizard to
 * fully-configured instances after an upgrade.
 *
 * Call once during startup, after ensureInstanceAdmin().
 */
export async function autoCompleteOnboardingIfConfigured(): Promise<void> {
  const status = await getInstanceSetting("onboarding.status");
  if (status === "completed") return;

  // If status is already set (in_progress), don't auto-complete — let them finish
  if (status !== null) return;

  // Check if the instance is already configured
  const [providers, models, selections] = await Promise.all([
    listProviders(),
    listModels(),
    getAllSelections(),
  ]);

  const hasProviders = providers.length > 0;
  const hasModels = models.length > 0;
  const hasBackendSelection = "backend" in selections;

  if (hasProviders && hasModels && hasBackendSelection) {
    await setInstanceSettings({
      "onboarding.status": "completed",
      "onboarding.completedAt": new Date().toISOString(),
      "onboarding.completedByUserId": "",
      "onboarding.currentStep": "summary",
    });
    logger.info(
      "Auto-completed onboarding for pre-configured instance (upgrade path)",
    );
  }
}

// =============================================================================
// Helpers
// =============================================================================

async function countUsers(): Promise<number> {
  const result = await db.select({ count: count() }).from(schema.users);
  return result[0]?.count ?? 0;
}

async function hasAdmin(): Promise<boolean> {
  const admin = await db.query.users.findFirst({
    where: eq(schema.users.isInstanceAdmin, true),
    columns: { id: true },
  });
  return !!admin;
}
