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
  autocompleteSelect,
  isCancelled,
} from "../../ui/clack.js";
import {
  advanceOnboardingStep,
  completeOnboardingViaApi,
  fetchOnboardingState,
  fetchProviderCatalog,
  fetchSetupPresets,
  getBackendUrl,
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
        initialValue: "admin",
        validate: (v) =>
          v.length < 2 ? "Name must be at least 2 characters" : undefined,
      });

      const email = await textInput({
        message: "Admin email:",
        initialValue: "admin@example.com",
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

      const confirmPassword = await passwordInput({
        message: "Confirm password:",
        validate: (v) =>
          v !== password ? "Passwords do not match" : undefined,
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
      try {
        const result = await advanceOnboardingStep("choose_preset", {
          presetId,
        });
        s.stop(`Preset: ${chalk.cyan(presetId)}`);
        if (result.warning) {
          log.warn(result.warning);
        }
      } catch (error) {
        s.stop("Failed to save preset");
        log.error(
          error instanceof Error ? error.message : "Preset selection failed",
        );
        cancel("Setup cancelled");
        return;
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
      let baseUrl: string | undefined;

      if (preset?.requiresApiKey) {
        apiKey = await passwordInput({
          message: `Enter your ${preset.name} API key:`,
          validate: (v) =>
            v.length < 10 ? "API key seems too short" : undefined,
        });
      }

      // Custom preset requires a base URL
      if (preset?.id === "custom") {
        baseUrl = await textInput({
          message: "Base URL of your OpenAI-compatible API:",
          placeholder: "http://127.0.0.1:8080/v1",
          validate: (v) =>
            v.trim().length === 0 ? "Base URL is required" : undefined,
        });

        const wantApiKey = await confirm({
          message: "Does this provider require an API key?",
          initialValue: false,
        });
        if (wantApiKey) {
          apiKey = await passwordInput({
            message: "API key:",
            validate: (v) =>
              v.length < 1 ? "API key cannot be empty" : undefined,
          });
        }
      }

      s.start("Creating provider(s)...");
      try {
        await advanceOnboardingStep("configure_provider", {
          presetId: state.selectedPreset,
          ...(apiKey && { apiKey }),
          ...(baseUrl && { baseUrl }),
        });
        s.stop("Provider(s) configured");
      } catch (error) {
        s.stop("Failed to configure provider");
        log.error(
          error instanceof Error ? error.message : "Provider setup failed",
        );
        cancel("Setup cancelled");
        return;
      }
    } else {
      log.step("Provider: configured");
    }

    // Step: Select Models
    if (!state.completedSteps.includes("select_models")) {
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

      // Try to fetch the model catalog from the provider
      s.start("Fetching available models...");
      const catalog = await fetchProviderCatalog(firstProviderId);
      s.stop(
        catalog && catalog.length > 0
          ? `Found ${catalog.length} models`
          : "Could not fetch model catalog — you can type a model ID manually",
      );

      // Backend model: filter to vision-capable models for the assistant
      const visionModels = catalog?.filter((m) =>
        m.inputModalities.includes("image"),
      );
      const backendCatalog =
        visionModels && visionModels.length > 0 ? visionModels : catalog;

      let backendModelId: string;
      if (backendCatalog && backendCatalog.length > 0) {
        backendModelId = await autocompleteSelect<string>({
          message:
            "Backend model ID (powers the assistant, vision-capable recommended):",
          options: backendCatalog.map((m) => ({
            value: m.providerModel,
            label: m.providerModel,
            hint: m.contextWindow
              ? `${m.name} — ${Math.round(m.contextWindow / 1024)}k ctx`
              : m.name,
          })),
          maxItems: 15,
          placeholder: "Type to search...",
        });
      } else {
        backendModelId = await textInput({
          message: "Backend model ID (powers the assistant):",
          placeholder: "e.g., anthropic/claude-sonnet-4",
          validate: (v) =>
            v.trim().length === 0 ? "Model ID is required" : undefined,
        });
      }

      // Workers model: show full catalog (no vision filter)
      let workersModelId: string;
      if (catalog && catalog.length > 0) {
        const useBackendForWorkers = await confirm({
          message: `Use the same model for content processing? (${backendModelId})`,
          initialValue: true,
        });
        if (useBackendForWorkers) {
          workersModelId = backendModelId;
        } else {
          workersModelId = await autocompleteSelect<string>({
            message: "Workers model ID (content processing):",
            options: catalog.map((m) => ({
              value: m.providerModel,
              label: m.providerModel,
              hint: m.contextWindow
                ? `${m.name} — ${Math.round(m.contextWindow / 1024)}k ctx`
                : m.name,
            })),
            maxItems: 15,
            placeholder: "Type to search...",
          });
        }
      } else {
        workersModelId = await textInput({
          message:
            "Workers model ID (content processing, leave empty to reuse backend):",
          placeholder: "Same as backend if empty",
        });
        if (!workersModelId.trim()) workersModelId = backendModelId;
      }

      // Look up capabilities from catalog if available
      const backendCatalogEntry = catalog?.find(
        (m) => m.providerModel === backendModelId,
      );
      const workersCatalogEntry = catalog?.find(
        (m) => m.providerModel === workersModelId,
      );

      const backendId = backendModelId.trim().replace(/[^a-zA-Z0-9-_.]/g, "-");
      const models = [
        {
          id: backendId,
          name: backendCatalogEntry?.name || backendModelId.trim(),
          provider: firstProviderId,
          providerModel: backendModelId.trim(),
          capabilities: {
            chat: true,
            tools: backendCatalogEntry?.tools ?? true,
            streaming: true,
            vision: backendCatalogEntry
              ? backendCatalogEntry.inputModalities.includes("image")
              : false,
          },
        },
      ];
      const setDefaults: Record<string, string> = { backend: backendId };

      if (
        workersModelId.trim() !== backendModelId.trim() ||
        secondProviderId !== firstProviderId
      ) {
        const workersId = `${workersModelId.trim().replace(/[^a-zA-Z0-9-_.]/g, "-")}-workers`;
        models.push({
          id: workersId,
          name:
            workersCatalogEntry?.name || `${workersModelId.trim()} (workers)`,
          provider: secondProviderId,
          providerModel: workersModelId.trim(),
          capabilities: {
            chat: true,
            tools: workersCatalogEntry?.tools ?? false,
            streaming: true,
            vision: workersCatalogEntry
              ? workersCatalogEntry.inputModalities.includes("image")
              : false,
          },
        });
        setDefaults.workers = workersId;
      } else {
        setDefaults.workers = backendId;
      }

      s.start("Importing models...");
      try {
        await advanceOnboardingStep("select_models", {
          models,
          setDefaults,
        });
        s.stop("Models configured");
      } catch (error) {
        s.stop("Failed to configure models");
        log.error(
          error instanceof Error ? error.message : "Model import failed",
        );
        cancel("Setup cancelled");
        return;
      }
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
      try {
        await advanceOnboardingStep("registration_policy", {
          registrationEnabled,
        });
        s.stop(`Registration: ${registrationEnabled ? "open" : "admin-only"}`);
      } catch (error) {
        s.stop("Failed to save registration policy");
        log.error(
          error instanceof Error
            ? error.message
            : "Registration policy update failed",
        );
        cancel("Setup cancelled");
        return;
      }
    } else {
      log.step("Registration: configured");
    }

    // Step: Complete
    s.start("Completing setup...");
    try {
      await completeOnboardingViaApi();
      s.stop("Setup complete!");
    } catch (error) {
      s.stop("Failed to complete setup");
      log.error(error instanceof Error ? error.message : "Completion failed");
      cancel("Setup cancelled");
      return;
    }

    const url = getBackendUrl();
    outro(
      `${icons.success} Eclaire is ready! Open ${chalk.cyan(url)} to get started.`,
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
