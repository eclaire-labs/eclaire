import inquirer from "inquirer";
import type {
  Context,
  Dialect,
  Model,
  ProviderConfig,
  ProviderPreset,
} from "../types/index.js";
import {
  colors,
  formatEngine,
  formatProvider,
  truncateString,
} from "./colors.js";

interface ModelWithId {
  id: string;
  model: Model;
}

interface ModelSelection {
  id: string;
  model: Model;
}

/**
 * Prompt for context selection
 */
export async function promptContext(
  message: string = "Select context:",
  availableContexts: string[] | null = null,
): Promise<Context> {
  let choices = [
    { name: "Backend", value: "backend" as const },
    { name: "Workers", value: "workers" as const },
    { name: "Both", value: "both" as const },
  ];

  // If specific contexts are provided, filter the choices
  if (availableContexts && Array.isArray(availableContexts)) {
    choices = choices.filter(
      (choice) =>
        availableContexts.includes(choice.value) || choice.value === "both",
    );
    // Remove 'both' option if only one context is available
    if (availableContexts.length === 1) {
      choices = choices.filter((choice) => choice.value !== "both");
    }
  }

  const { context } = await inquirer.prompt([
    {
      type: "select",
      name: "context",
      message,
      choices,
    },
  ]);

  return context;
}

/**
 * Prompt for model selection from a list
 */
export async function promptModelSelection(
  models: ModelWithId[],
  message: string = "Select a model:",
): Promise<ModelSelection> {
  if (models.length === 0) {
    throw new Error("No models available for selection");
  }

  const choices = models.map(({ id, model }) => ({
    name: `${formatProvider(model.provider)}:${id}${colors.dim(` - ${truncateString(model.name, 60)}`)}`,
    value: { id, model },
    short: `${model.provider}:${id}`,
  }));

  const { selected } = await inquirer.prompt([
    {
      type: "select",
      name: "selected",
      message,
      choices,
      pageSize: 10,
    },
  ]);

  return selected;
}

/**
 * Prompt for confirmation
 */
export async function promptConfirmation(
  message: string,
  defaultValue: boolean = false,
): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message,
      default: defaultValue,
    },
  ]);

  return confirmed;
}

/**
 * Prompt for provider selection from available providers
 */
export async function promptProviderSelection(
  providers: string[],
  message: string = "Select provider:",
): Promise<string> {
  if (providers.length === 0) {
    throw new Error("No providers available for selection");
  }

  const choices = providers.map((provider) => ({
    name: formatProvider(provider),
    value: provider,
  }));

  const { selected } = await inquirer.prompt([
    {
      type: "select",
      name: "selected",
      message,
      choices,
    },
  ]);

  return selected;
}

/**
 * Prompt for provider preset selection
 */
export async function promptPresetSelection(
  presets: ProviderPreset[],
  message: string = "Select provider type:",
): Promise<ProviderPreset> {
  const choices = presets.map((preset) => ({
    name: `${preset.isCloud ? "\u2601\uFE0F" : "\uD83D\uDDA5\uFE0F"} ${preset.name}${colors.dim(` - ${preset.description}`)}`,
    value: preset,
    short: preset.name,
  }));

  const { selected } = await inquirer.prompt([
    {
      type: "select",
      name: "selected",
      message,
      choices,
      pageSize: 10,
    },
  ]);

  return selected;
}

/**
 * Prompt for provider ID
 */
export async function promptProviderId(
  defaultValue: string,
  validateFn: (id: string) => boolean | string,
): Promise<string> {
  const { providerId } = await inquirer.prompt([
    {
      type: "input",
      name: "providerId",
      message: "Provider ID (unique identifier):",
      default: defaultValue,
      validate: validateFn,
    },
  ]);

  return providerId;
}

/**
 * Prompt for API key (password input)
 */
export async function promptApiKey(
  message: string = "Enter API key:",
): Promise<string> {
  const { apiKey } = await inquirer.prompt([
    {
      type: "password",
      name: "apiKey",
      message,
      mask: "*",
      validate: (input: string) => input.length > 0 || "API key is required",
    },
  ]);

  return apiKey;
}

/**
 * Prompt for port number
 */
export async function promptPort(
  message: string = "Enter port number:",
  defaultValue: number = 11500,
): Promise<number> {
  const { port } = await inquirer.prompt([
    {
      type: "number",
      name: "port",
      message,
      default: defaultValue,
      validate: (input: number) => {
        if (isNaN(input) || input < 1 || input > 65535) {
          return "Please enter a valid port number (1-65535)";
        }
        return true;
      },
    },
  ]);

  return port;
}

/**
 * Prompt for base URL
 */
export async function promptBaseUrl(
  message: string = "Enter base URL:",
  defaultValue: string = "http://127.0.0.1:11500",
): Promise<string> {
  const { baseUrl } = await inquirer.prompt([
    {
      type: "input",
      name: "baseUrl",
      message,
      default: defaultValue,
      validate: (input: string) => {
        try {
          new URL(input);
          return true;
        } catch {
          return "Please enter a valid URL";
        }
      },
    },
  ]);

  return baseUrl;
}

/**
 * Prompt for dialect selection
 */
export async function promptDialect(
  message: string = "Select API dialect:",
  defaultValue: Dialect = "openai_compatible",
): Promise<Dialect> {
  const { dialect } = await inquirer.prompt([
    {
      type: "select",
      name: "dialect",
      message,
      choices: [
        {
          name: "OpenAI-compatible (OpenAI, OpenRouter, llama.cpp, etc.)",
          value: "openai_compatible",
        },
        {
          name: "Anthropic Messages API (Claude)",
          value: "anthropic_messages",
        },
        { name: "MLX Native (for mlx-vlm)", value: "mlx_native" },
      ],
      default: defaultValue,
    },
  ]);

  return dialect;
}

/**
 * Prompt for auth type selection
 */
export async function promptAuthType(
  message: string = "Select authentication type:",
  defaultValue: "none" | "bearer" | "header" = "none",
): Promise<"none" | "bearer" | "header"> {
  const { authType } = await inquirer.prompt([
    {
      type: "select",
      name: "authType",
      message,
      choices: [
        { name: "None (local servers)", value: "none" },
        { name: "Bearer token (Authorization: Bearer ...)", value: "bearer" },
        { name: "Custom header (e.g., x-api-key)", value: "header" },
      ],
      default: defaultValue,
    },
  ]);

  return authType;
}

/**
 * Prompt for custom header name
 */
export async function promptHeaderName(
  message: string = "Enter header name for API key:",
  defaultValue: string = "X-API-Key",
): Promise<string> {
  const { headerName } = await inquirer.prompt([
    {
      type: "input",
      name: "headerName",
      message,
      default: defaultValue,
      validate: (input: string) =>
        input.length > 0 || "Header name is required",
    },
  ]);

  return headerName;
}

/**
 * Prompt for editing provider fields
 */
export async function promptProviderFields(
  currentConfig: ProviderConfig,
): Promise<Partial<ProviderConfig>> {
  const { fieldsToEdit } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "fieldsToEdit",
      message: "Select fields to edit:",
      choices: [
        { name: "Base URL", value: "baseUrl" },
        { name: "Endpoint", value: "endpoint" },
        { name: "Dialect", value: "dialect" },
        { name: "Authentication", value: "auth" },
        { name: "Engine", value: "engine" },
      ],
    },
  ]);

  const updates: Partial<ProviderConfig> = {};

  for (const field of fieldsToEdit) {
    switch (field) {
      case "baseUrl":
        updates.baseUrl = await promptBaseUrl(
          "New base URL:",
          currentConfig.baseUrl,
        );
        break;
      case "dialect":
        updates.dialect = await promptDialect(
          "New dialect:",
          currentConfig.dialect,
        );
        break;
      case "auth": {
        const authType = await promptAuthType(
          "New auth type:",
          currentConfig.auth.type,
        );
        const auth: ProviderConfig["auth"] = { type: authType };
        if (authType === "bearer" || authType === "header") {
          const apiKey = await promptApiKey("New API key:");
          const headerName =
            authType === "bearer"
              ? "Authorization"
              : await promptHeaderName(
                  "Header name:",
                  currentConfig.auth.header,
                );
          auth.header = headerName;
          auth.value = authType === "bearer" ? `Bearer ${apiKey}` : apiKey;
        }
        updates.auth = auth;
        break;
      }
      case "engine": {
        const { engine } = await inquirer.prompt([
          {
            type: "input",
            name: "engine",
            message: "New engine (or empty to remove):",
            default: currentConfig.engine || "",
          },
        ]);
        if (engine) {
          updates.engine = engine;
        }
        break;
      }
    }
  }

  return updates;
}
