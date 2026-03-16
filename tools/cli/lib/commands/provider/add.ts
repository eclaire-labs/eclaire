import {
  getPresetById,
  getPresetsForSelection,
  PROVIDER_PRESETS,
} from "../../config/presets.js";
import { addProvider, isProviderIdAvailable } from "../../config/providers.js";
import { closeDb } from "../../db/index.js";
import type {
  CommandOptions,
  ProviderConfig,
  ProviderPreset,
} from "../../types/index.js";
import {
  cancel,
  CancelledError,
  confirm,
  intro,
  isCancelled,
  log,
  outro,
  textInput,
} from "../../ui/clack.js";
import { colors, icons } from "../../ui/colors.js";
import {
  promptApiKey,
  promptAuthType,
  promptBaseUrl,
  promptDialect,
  promptHeaderName,
  promptPort,
  promptPresetSelection,
  promptProviderId,
} from "../../ui/prompts.js";
import { createProviderInfoTable } from "../../ui/tables.js";

export async function addCommand(options: CommandOptions): Promise<void> {
  try {
    intro(`${icons.plug} Add Provider`);

    let preset: ProviderPreset;

    // Use preset from option or prompt for selection
    if (options.preset) {
      const foundPreset = getPresetById(options.preset);
      if (!foundPreset) {
        cancel(`Unknown preset: ${options.preset}`);
        log.info(
          colors.dim(
            "Available presets: " +
              PROVIDER_PRESETS.map((p) => p.id).join(", "),
          ),
        );
        process.exit(1);
      }
      preset = foundPreset;
      log.info(`Using preset: ${preset.name}`);
    } else {
      preset = await promptPresetSelection(
        getPresetsForSelection(),
        "Select provider type:",
      );
    }

    log.info(colors.dim(preset.description));

    // Generate default provider ID
    const defaultId = await generateProviderId(preset.id);

    // Prompt for provider ID
    const providerId = await promptProviderId(
      defaultId,
      async (input: string) => {
        if (!input || input.trim().length === 0) {
          return "Provider ID is required";
        }
        if (!/^[a-z0-9-]+$/.test(input)) {
          return "Provider ID can only contain lowercase letters, numbers, and hyphens";
        }
        if (!(await isProviderIdAvailable(input))) {
          return `Provider ID '${input}' already exists`;
        }
        return true;
      },
    );

    // Build provider config based on preset
    const config: ProviderConfig = {
      dialect: preset.config.dialect,
      baseUrl: preset.config.baseUrl,
      auth: { type: preset.config.auth.type },
    };

    if (preset.config.headers) {
      config.headers = { ...preset.config.headers };
    }

    if (preset.config.overrides) {
      config.overrides = { ...preset.config.overrides };
    }

    // Handle custom configuration
    if (preset.id === "custom") {
      log.info(colors.subheader("Custom Configuration:"));

      config.baseUrl = await promptBaseUrl(
        "Base URL (include /v1 for OpenAI-compatible):",
        preset.config.baseUrl,
      );
      config.dialect = await promptDialect(
        "API Dialect:",
        preset.config.dialect,
      );
      config.auth.type = await promptAuthType("Authentication Type:", "none");

      if (config.auth.type === "bearer" || config.auth.type === "header") {
        const apiKey = await promptApiKey();
        config.auth.header =
          config.auth.type === "bearer"
            ? "Authorization"
            : await promptHeaderName();
        config.auth.value =
          config.auth.type === "bearer" ? `Bearer ${apiKey}` : apiKey;
      }

      // Ask if this is a local provider
      const isLocal = await confirm({
        message: "Is this a local inference server?",
        initialValue: false,
      });

      if (isLocal) {
        // Ask for engine configuration
        const engineName = await textInput({
          message: "Engine name (e.g., llama-cpp, ollama):",
          defaultValue: "llama-cpp",
        });

        const managed = await confirm({
          message: "Should Eclaire manage this server (start/stop via CLI)?",
          initialValue: engineName === "llama-cpp",
        });

        config.engine = {
          managed,
          name: engineName,
        };

        if (managed && engineName === "llama-cpp") {
          // Prompt for llama-cpp specific settings
          const contextSizeRaw = await textInput({
            message: "Context size (tokens):",
            defaultValue: "8192",
            validate: (value: string) => {
              const num = Number.parseInt(value, 10);
              if (Number.isNaN(num) || num < 1) {
                return "Please enter a valid positive number";
              }
            },
          });
          const contextSize = Number.parseInt(contextSizeRaw, 10);

          const gpuLayersRaw = await textInput({
            message: "GPU layers (-1 for all):",
            defaultValue: "-1",
            validate: (value: string) => {
              const num = Number.parseInt(value, 10);
              if (Number.isNaN(num)) {
                return "Please enter a valid number";
              }
            },
          });
          const gpuLayers = Number.parseInt(gpuLayersRaw, 10);

          config.engine.contextSize = contextSize;
          config.engine.gpuLayers = gpuLayers;
          config.engine.batchSize = 512;
        }
      }
    } else {
      // For non-custom presets, ask for customizations

      // For local providers, ask about port
      if (!preset.isCloud && preset.defaultPort) {
        const useDefaultPort = await confirm({
          message: `Use default port ${preset.defaultPort}?`,
          initialValue: true,
        });

        if (!useDefaultPort) {
          const port = await promptPort(
            "Enter port number:",
            preset.defaultPort,
          );
          // Update baseUrl with new port
          const url = new URL(config.baseUrl);
          url.port = String(port);
          config.baseUrl = url.toString().replace(/\/$/, "");
        }
      }

      // For cloud providers requiring API key
      if (preset.config.auth.requiresApiKey) {
        log.info(colors.subheader("Authentication:"));
        const apiKey = await promptApiKey(`Enter ${preset.name} API key:`);
        // For cloud providers, we recommend using environment variables
        if (preset.config.auth.envVar) {
          log.info(
            colors.dim(
              `Tip: Set ${preset.config.auth.envVar} in your .env file for secure storage`,
            ),
          );
          config.auth.header =
            preset.config.auth.type === "bearer"
              ? "Authorization"
              : preset.config.auth.envVar === "ANTHROPIC_API_KEY"
                ? "x-api-key"
                : "Authorization";
          config.auth.value =
            preset.config.auth.type === "bearer" ? `Bearer ${apiKey}` : apiKey;
        } else {
          config.auth.header = "Authorization";
          config.auth.value = `Bearer ${apiKey}`;
        }
      }

      // For local presets with defaultEngine, ask about management
      if (preset.defaultEngine) {
        log.info(colors.subheader("Engine Configuration:"));

        // Only llama-cpp can be managed currently
        const canBeManaged = preset.defaultEngine.name === "llama-cpp";

        if (canBeManaged) {
          const managed = await confirm({
            message: "Should Eclaire manage this server (start/stop via CLI)?",
            initialValue: true,
          });

          config.engine = {
            managed,
            name: preset.defaultEngine.name,
            ...(managed &&
              preset.defaultEngine.gpuLayers !== undefined && {
                gpuLayers: preset.defaultEngine.gpuLayers,
              }),
            ...(managed &&
              preset.defaultEngine.contextSize !== undefined && {
                contextSize: preset.defaultEngine.contextSize,
              }),
            ...(managed &&
              preset.defaultEngine.batchSize !== undefined && {
                batchSize: preset.defaultEngine.batchSize,
              }),
          };
        } else {
          // For other engines (ollama, lm-studio, mlx), they are external
          config.engine = {
            managed: false,
            name: preset.defaultEngine.name,
          };
          log.info(
            colors.dim(
              `Engine '${preset.defaultEngine.name}' is external - Eclaire will connect but not start/stop it`,
            ),
          );
        }
      }
    }

    // Show summary
    log.info(colors.subheader("Provider Configuration:"));
    console.log(createProviderInfoTable(providerId, config));

    // Confirm
    const proceed = await confirm({
      message: "Add this provider?",
      initialValue: true,
    });

    if (!proceed) {
      cancel("Cancelled");
      await closeDb();
      return;
    }

    // Add provider
    await addProvider(providerId, config);
    await closeDb();

    outro(
      colors.success(
        `${icons.success} Provider '${providerId}' added successfully!`,
      ),
    );

    if (!preset.isCloud) {
      console.log(
        colors.dim(
          `\nMake sure ${preset.name} is running on ${config.baseUrl}`,
        ),
      );
      console.log(
        colors.dim(`Test connectivity: eclaire provider test ${providerId}`),
      );
    } else {
      console.log(
        colors.dim(`\nTest connectivity: eclaire provider test ${providerId}`),
      );
    }
  } catch (error: unknown) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("User force closed")) {
      cancel("Cancelled");
      await closeDb();
      return;
    }
    console.log(
      colors.error(`${icons.error} Failed to add provider: ${message}`),
    );
    await closeDb();
    process.exit(1);
  }
}

async function generateProviderId(presetId: string): Promise<string> {
  // Generate a unique provider ID based on preset
  const baseName = presetId === "custom" ? "custom-provider" : presetId;

  // Check if base name is available
  if (await isProviderIdAvailable(baseName)) {
    return baseName;
  }

  // Add suffix if needed
  let suffix = 2;
  while (!(await isProviderIdAvailable(`${baseName}-${suffix}`))) {
    suffix++;
  }
  return `${baseName}-${suffix}`;
}
