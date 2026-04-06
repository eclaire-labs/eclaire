/**
 * Onboarding API Routes
 *
 * Shared API consumed by both the web setup wizard and CLI onboard command.
 * Uses adaptive auth: public when no users exist, admin-only otherwise.
 */

import { Hono } from "hono";
import { createChildLogger } from "../lib/logger.js";
import {
  advanceStep,
  completeOnboarding,
  getOnboardingState,
  getSetupPresets,
  resetOnboarding,
  runHealthChecks,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "../lib/services/onboarding.js";
import { withOnboardingAuth } from "../middleware/with-onboarding-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("routes:onboarding");

export const onboardingRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/onboarding/state — Full onboarding state
onboardingRoutes.get(
  "/state",
  withOnboardingAuth(async (c) => {
    const state = await getOnboardingState();
    return c.json(state);
  }, logger),
);

// GET /api/onboarding/presets — Setup presets list
onboardingRoutes.get(
  "/presets",
  withOnboardingAuth(async (c) => {
    const presets = getSetupPresets();
    return c.json({ items: presets });
  }, logger),
);

// POST /api/onboarding/step/:step — Advance a specific step
onboardingRoutes.post(
  "/step/:step",
  withOnboardingAuth(async (c, userId) => {
    const step = c.req.param("step") as string;
    if (!ONBOARDING_STEPS.includes(step as OnboardingStep)) {
      return c.json(
        {
          error: `Invalid step: "${step}". Valid steps: ${ONBOARDING_STEPS.join(", ")}`,
        },
        400,
      );
    }

    const body = c.req.header("content-type")?.includes("application/json")
      ? ((await c.req.json()) as Record<string, unknown>)
      : {};

    const result = await advanceStep(step as OnboardingStep, body, userId);

    if (!result.ok) {
      return c.json({ error: result.error, state: result.state }, 400);
    }

    return c.json(result);
  }, logger),
);

// POST /api/onboarding/health-check — Run health checks
onboardingRoutes.post(
  "/health-check",
  withOnboardingAuth(async (c) => {
    const result = await runHealthChecks();
    return c.json(result);
  }, logger),
);

// POST /api/onboarding/complete — Mark onboarding as complete
onboardingRoutes.post(
  "/complete",
  withOnboardingAuth(async (c, userId) => {
    await completeOnboarding(userId);
    const state = await getOnboardingState();
    return c.json(state);
  }, logger),
);

// POST /api/onboarding/reset — Reset onboarding so the wizard can be re-run (admin only)
onboardingRoutes.post(
  "/reset",
  withOnboardingAuth(async (c, userId) => {
    if (!userId) {
      return c.json({ error: "Admin authentication required" }, 401);
    }
    await resetOnboarding(userId);
    const state = await getOnboardingState();
    return c.json(state);
  }, logger),
);
