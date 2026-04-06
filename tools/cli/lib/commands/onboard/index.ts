import type { Command } from "commander";
import chalk from "chalk";
import {
  intro,
  outro,
  cancel,
  log,
  spinner,
  selectOne,
  confirm,
  textInput,
  passwordInput,
  isCancelled,
} from "../../ui/clack.js";
import {
  advanceOnboardingStep,
  completeOnboardingViaApi,
  fetchOnboardingState,
  fetchSetupPresets,
  registerUser,
  resetOnboardingViaApi,
  runOnboardingHealthCheck,
} from "../../backend-client.js";
import { icons } from "../../ui/colors.js";

async function onboardCommand(opts: { preset?: string; reset?: boolean }) {
  try {
    intro(chalk.cyan.bold("Eclaire Setup"));

    const s = spinner();

    // Handle --reset flag
    if (opts.reset) {
      s.start("Resetting onboarding state...");
      try {
        await resetOnboardingViaApi();
        s.stop("Onboarding reset");
        log.info(
          "Providers and models are preserved. Only onboarding progress was cleared.",
        );
      } catch (error) {
        s.stop("Reset failed");
        log.error(
          error instanceof Error ? error.message : "Failed to reset onboarding",
        );
        cancel("Setup cancelled");
        return;
      }
    }

    // Fetch onboarding state
    s.start("Checking instance state...");
    const state = await fetchOnboardingState();

    if (!state) {
      s.stop("Backend unreachable");
      log.error(
        "Cannot reach the Eclaire backend. Make sure it is running:\n" +
          "  Docker: docker compose up -d\n" +
          "  Dev:    pnpm dev",
      );
      cancel("Setup cancelled");
      return;
    }

    if (state.status === "completed") {
      s.stop("Setup already complete");
      outro(
        `${icons.success} Eclaire is already configured. Run ${chalk.cyan("eclaire doctor")} to check health.`,
      );
      return;
    }

    s.stop(
      `Instance: ${state.userCount} users, ${state.adminExists ? "admin exists" : "no admin"}`,
    );

    // Step: Claim Admin
    if (!state.adminExists) {
      log.step("No admin account exists. Let's create one.");

      const name = await textInput({
        message: "Admin name:",
        placeholder: "Your name",
        validate: (v) =>
          v.length < 2 ? "Name must be at least 2 characters" : undefined,
      });

      const email = await textInput({
        message: "Admin email:",
        placeholder: "admin@example.com",
        validate: (v) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
            ? undefined
            : "Please enter a valid email",
      });

      const password = await passwordInput({
        message: "Admin password:",
        validate: (v) =>
          v.length < 8 ? "Password must be at least 8 characters" : undefined,
      });

      s.start("Creating admin account...");
      const regResult = await registerUser(name, email, password);
      if (!regResult.ok) {
        s.stop("Registration failed");
        log.error(regResult.error ?? "Failed to create admin account");
        cancel("Setup cancelled");
        return;
      }
      s.stop("Admin account created");

      // Re-fetch state after admin creation
      const updatedState = await fetchOnboardingState();
      if (updatedState) {
        Object.assign(state, updatedState);
      }
    } else {
      log.step("Admin account exists");
    }

    // Step: Choose Preset
    if (!state.completedSteps.includes("choose_preset")) {
      const presets = await fetchSetupPresets();
      if (!presets || presets.length === 0) {
        log.error("No setup presets available.");
        cancel("Setup cancelled");
        return;
      }

      let presetId = opts.preset;
      if (!presetId) {
        presetId = await selectOne<string>({
          message: "Choose an AI setup:",
          options: presets.map((p) => ({
            value: p.id,
            label: `${p.isCloud ? icons.cloud : icons.server} ${p.name}`,
            hint: p.description,
          })),
        });
      }

      s.start("Saving preset selection...");
      const result = await advanceOnboardingStep("choose_preset", {
        presetId,
      });
      s.stop(result.ok ? "Preset selected" : "Failed to save preset");
      if (result.warning) {
        log.warn(result.warning);
      }
    } else {
      log.step(`Preset: ${chalk.cyan(state.selectedPreset ?? "unknown")}`);
    }

    // Step: Configure Provider
    if (!state.completedSteps.includes("configure_provider")) {
      // Re-fetch state to pick up the selected preset from the previous step
      const refreshedState = await fetchOnboardingState();
      if (refreshedState) Object.assign(state, refreshedState);

      const presets = await fetchSetupPresets();
      const preset = presets?.find((p) => p.id === state.selectedPreset);

      let apiKey: string | undefined;
      if (preset?.requiresApiKey) {
        apiKey = await passwordInput({
          message: `Enter your ${preset.name} API key:`,
          validate: (v) =>
            v.length < 10 ? "API key seems too short" : undefined,
        });
      }

      s.start("Creating provider(s)...");
      const result = await advanceOnboardingStep("configure_provider", {
        presetId: state.selectedPreset,
        ...(apiKey && { apiKey }),
      });
      s.stop(
        result.ok ? "Provider(s) configured" : "Failed to configure provider",
      );
    } else {
      log.step("Provider: configured");
    }

    // Step: Select Models
    if (!state.completedSteps.includes("select_models")) {
      const backendModelName = await textInput({
        message: "Backend model name (powers the assistant):",
        placeholder: "e.g., qwen3-14b or gpt-4o",
        validate: (v) =>
          v.trim().length === 0 ? "Model name is required" : undefined,
      });

      const workersModelName = await textInput({
        message:
          "Workers model name (content processing, leave empty to reuse backend):",
        placeholder: "Same as backend if empty",
      });

      // Determine provider IDs
      const providerState = await fetchOnboardingState();
      const presetList = await fetchSetupPresets();
      const activePreset = presetList?.find(
        (p) => p.id === (providerState?.selectedPreset ?? state.selectedPreset),
      );
      const firstProviderId = activePreset?.providers[0]
        ? `${activePreset.providers[0].presetId}${activePreset.providers[0].idSuffix ?? ""}`
        : "custom";
      const secondProviderId = activePreset?.providers[1]
        ? `${activePreset.providers[1].presetId}${activePreset.providers[1].idSuffix ?? ""}`
        : firstProviderId;

      const backendId = backendModelName
        .trim()
        .replace(/[^a-zA-Z0-9-_.]/g, "-");
      const actualWorkers = workersModelName.trim() || backendModelName.trim();
      const models = [
        {
          id: backendId,
          name: backendModelName.trim(),
          provider: firstProviderId,
          providerModel: backendModelName.trim(),
          capabilities: {
            chat: true,
            tools: true,
            streaming: true,
            vision: false,
          },
        },
      ];
      const setDefaults: Record<string, string> = { backend: backendId };

      if (
        actualWorkers !== backendModelName.trim() ||
        secondProviderId !== firstProviderId
      ) {
        const workersId = `${actualWorkers.replace(/[^a-zA-Z0-9-_.]/g, "-")}-workers`;
        models.push({
          id: workersId,
          name: `${actualWorkers} (workers)`,
          provider: secondProviderId,
          providerModel: actualWorkers,
          capabilities: {
            chat: true,
            tools: false,
            streaming: true,
            vision: false,
          },
        });
        setDefaults.workers = workersId;
      } else {
        setDefaults.workers = backendId;
      }

      s.start("Importing models...");
      const modelResult = await advanceOnboardingStep("select_models", {
        models,
        setDefaults,
      });
      s.stop(
        modelResult.ok ? "Models configured" : "Failed to configure models",
      );
    } else {
      log.step("Models: configured");
    }

    // Step: Health Check
    if (!state.completedSteps.includes("health_check")) {
      s.start("Running health checks...");
      try {
        const health = await runOnboardingHealthCheck();
        s.stop("Health checks complete");

        const dbStatus = health.db.ok
          ? `${icons.success} Database`
          : `${icons.error} Database: ${health.db.error}`;
        const doclingStatus = health.docling.ok
          ? `${icons.success} Docling`
          : `${icons.warning} Docling: ${health.docling.error ?? "unreachable (optional)"}`;

        log.info(dbStatus);
        log.info(doclingStatus);
        for (const p of health.providers) {
          log.info(
            p.ok
              ? `${icons.success} Provider: ${p.name}`
              : `${icons.error} Provider: ${p.name} — ${p.error}`,
          );
        }
        log.info(
          health.modelSelections.backend
            ? `${icons.success} Backend model: ${health.modelSelections.backend}`
            : `${icons.warning} No backend model selected`,
        );
      } catch {
        s.stop("Health check failed");
      }

      try {
        await advanceOnboardingStep("health_check", {});
      } catch (err) {
        log.warn(
          `Could not advance health check step: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Step: Registration Policy
    if (!state.completedSteps.includes("registration_policy")) {
      const registrationEnabled = await confirm({
        message: "Allow open user registration?",
        initialValue: true,
      });

      s.start("Saving registration policy...");
      await advanceOnboardingStep("registration_policy", {
        registrationEnabled,
      });
      s.stop(`Registration: ${registrationEnabled ? "open" : "admin-only"}`);
    } else {
      log.step("Registration: configured");
    }

    // Step: Complete
    s.start("Completing setup...");
    await completeOnboardingViaApi();
    s.stop("Setup complete!");

    outro(
      `${icons.success} Eclaire is ready! Open ${chalk.cyan("http://localhost:3000")} to get started.`,
    );
  } catch (error) {
    if (isCancelled(error)) {
      cancel("Setup cancelled");
      return;
    }
    throw error;
  }
}

export function registerOnboardCommands(program: Command): void {
  program
    .command("onboard")
    .alias("setup")
    .description("Interactive setup wizard")
    .option("--preset <name>", "Skip preset selection and use specified preset")
    .option("--reset", "Reset onboarding state and re-run the wizard")
    .action(onboardCommand);
}
