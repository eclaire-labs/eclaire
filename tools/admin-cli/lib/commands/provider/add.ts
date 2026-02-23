import inquirer from "inquirer";
import {
  getPresetById,
  getPresetsForSelection,
  PROVIDER_PRESETS,
} from "../../config/presets.js";
import { addProvider, isProviderIdAvailable } from "../../config/providers.js";
import type {
  CommandOptions,
  ProviderConfig,
  ProviderPreset,
} from "../../types/index.js";
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
    console.log(colors.header(`${icons.plug} Add New Provider\n`));

    let preset: ProviderPreset;

    // Use preset from option or prompt for selection
    if (options.preset) {
      const foundPreset = getPresetById(options.preset);
      if (!foundPreset) {
        console.log(
          colors.error(`${icons.error} Unknown preset: ${options.preset}`),
        );
        console.log(
          colors.dim(
            "Available presets: " +
              PROVIDER_PRESETS.map((p) => p.id).join(", "),
          ),
        );
        process.exit(1);
      }
      preset = foundPreset;
      console.log(colors.info(`Using preset: ${preset.name}`));
    } else {
      preset = await promptPresetSelection(
        getPresetsForSelection(),
        "Select provider type:",
      );
    }

    console.log(colors.dim(`\n${preset.description}\n`));

    // Generate default provider ID
    const defaultId = generateProviderId(preset.id);

    // Prompt for provider ID
    const providerId = await promptProviderId(defaultId, (input: string) => {
      if (!input || input.trim().length === 0) {
        return "Provider ID is required";
      }
      if (!/^[a-z0-9-]+$/.test(input)) {
        return "Provider ID can only contain lowercase letters, numbers, and hyphens";
      }
      if (!isProviderIdAvailable(input)) {
        return `Provider ID '${input}' already exists`;
      }
      return true;
    });

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
      console.log(colors.subheader("\nCustom Configuration:"));

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
      const { isLocal } = await inquirer.prompt([
        {
          type: "confirm",
          name: "isLocal",
          message: "Is this a local inference server?",
          default: false,
        },
      ]);

      if (isLocal) {
        // Ask for engine configuration
        const { engineName } = await inquirer.prompt([
          {
            type: "input",
            name: "engineName",
            message: "Engine name (e.g., llama-cpp, ollama):",
            default: "llama-cpp",
          },
        ]);

        const { managed } = await inquirer.prompt([
          {
            type: "confirm",
            name: "managed",
            message: "Should Eclaire manage this server (start/stop via CLI)?",
            default: engineName === "llama-cpp",
          },
        ]);

        config.engine = {
          managed,
          name: engineName,
        };

        if (managed && engineName === "llama-cpp") {
          // Prompt for llama-cpp specific settings
          const { contextSize, gpuLayers } = await inquirer.prompt([
            {
              type: "number",
              name: "contextSize",
              message: "Context size (tokens):",
              default: 8192,
            },
            {
              type: "number",
              name: "gpuLayers",
              message: "GPU layers (-1 for all):",
              default: -1,
            },
          ]);
          config.engine.contextSize = contextSize;
          config.engine.gpuLayers = gpuLayers;
          config.engine.batchSize = 512;
        }
      }
    } else {
      // For non-custom presets, ask for customizations

      // For local providers, ask about port
      if (!preset.isCloud && preset.defaultPort) {
        const useDefaultPort = await inquirer.prompt([
          {
            type: "confirm",
            name: "useDefault",
            message: `Use default port ${preset.defaultPort}?`,
            default: true,
          },
        ]);

        if (!useDefaultPort.useDefault) {
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
        console.log(colors.subheader("\nAuthentication:"));
        const apiKey = await promptApiKey(`Enter ${preset.name} API key:`);
        // For cloud providers, we recommend using environment variables
        if (preset.config.auth.envVar) {
          console.log(
            colors.dim(
              `\nTip: Set ${preset.config.auth.envVar} in your .env file for secure storage`,
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
        console.log(colors.subheader("\nEngine Configuration:"));

        // Only llama-cpp can be managed currently
        const canBeManaged = preset.defaultEngine.name === "llama-cpp";

        if (canBeManaged) {
          const { managed } = await inquirer.prompt([
            {
              type: "confirm",
              name: "managed",
              message:
                "Should Eclaire manage this server (start/stop via CLI)?",
              default: true,
            },
          ]);

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
          console.log(
            colors.dim(
              `Engine '${preset.defaultEngine.name}' is external - Eclaire will connect but not start/stop it`,
            ),
          );
        }
      }
    }

    // Show summary
    console.log(colors.subheader("\nProvider Configuration:"));
    console.log(createProviderInfoTable(providerId, config));

    // Confirm
    const { proceed } = await inquirer.prompt([
      {
        type: "confirm",
        name: "proceed",
        message: "Add this provider?",
        default: true,
      },
    ]);

    if (!proceed) {
      console.log(colors.dim("Cancelled by user"));
      return;
    }

    // Add provider
    addProvider(providerId, config);

    console.log(
      colors.success(
        `\n${icons.success} Provider '${providerId}' added successfully!`,
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
  } catch (error: any) {
    if (error.message.includes("User force closed")) {
      console.log(colors.dim("\nCancelled by user"));
      return;
    }
    console.log(
      colors.error(`${icons.error} Failed to add provider: ${error.message}`),
    );
    process.exit(1);
  }
}

function generateProviderId(presetId: string): string {
  // Generate a unique provider ID based on preset
  const baseName = presetId === "custom" ? "custom-provider" : presetId;

  // Check if base name is available
  if (isProviderIdAvailable(baseName)) {
    return baseName;
  }

  // Add suffix if needed
  let suffix = 2;
  while (!isProviderIdAvailable(`${baseName}-${suffix}`)) {
    suffix++;
  }
  return `${baseName}-${suffix}`;
}
