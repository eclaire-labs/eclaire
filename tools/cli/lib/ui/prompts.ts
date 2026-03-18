import type {
  Context,
  Dialect,
  Model,
  ProviderConfig,
  ProviderPreset,
} from "../types/index.js";
import {
  confirm,
  log,
  passwordInput,
  selectMany,
  selectOne,
  textInput,
} from "./clack.js";
import { formatProvider, truncateString } from "./colors.js";

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
  let options = [
    { value: "backend" as const, label: "Backend" },
    { value: "workers" as const, label: "Workers" },
    { value: "both" as const, label: "Both" },
  ];

  if (availableContexts && Array.isArray(availableContexts)) {
    options = options.filter(
      (opt) => availableContexts.includes(opt.value) || opt.value === "both",
    );
    if (availableContexts.length === 1) {
      options = options.filter((opt) => opt.value !== "both");
    }
  }

  return selectOne<Context>({ message, options });
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

  // selectOne requires primitive values, so use index-based selection
  const options = models.map(({ id, model }, index) => ({
    value: String(index),
    label: `${formatProvider(model.provider)}:${id}`,
    hint: truncateString(model.name, 60),
  }));

  const selectedIndex = await selectOne<string>({ message, options });
  const idx = Number.parseInt(selectedIndex, 10);
  const selected = models[idx] as (typeof models)[0];
  return { id: selected.id, model: selected.model };
}

/**
 * Prompt for confirmation
 */
export async function promptConfirmation(
  message: string,
  defaultValue: boolean = false,
): Promise<boolean> {
  return confirm({ message, initialValue: defaultValue });
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

  const options = providers.map((provider) => ({
    value: provider,
    label: formatProvider(provider),
  }));

  return selectOne<string>({ message, options });
}

/**
 * Prompt for provider preset selection
 */
export async function promptPresetSelection(
  presets: ProviderPreset[],
  message: string = "Select provider type:",
): Promise<ProviderPreset> {
  // Use index-based selection for complex objects
  const options = presets.map((preset, index) => ({
    value: String(index),
    label: `${preset.isCloud ? "\u2601\uFE0F" : "\uD83D\uDDA5\uFE0F"} ${preset.name}`,
    hint: preset.description,
  }));

  const selectedIndex = await selectOne<string>({ message, options });
  return presets[Number.parseInt(selectedIndex, 10)] as ProviderPreset;
}

/**
 * Prompt for provider ID
 */
export async function promptProviderId(
  defaultValue: string,
  validateFn: (id: string) => boolean | string | Promise<boolean | string>,
): Promise<string> {
  // clack's text validate doesn't support async, so we loop manually
  while (true) {
    const value = await textInput({
      message: "Provider ID (unique identifier):",
      defaultValue,
    });
    const result = await validateFn(value);
    if (result === true) return value;
    if (typeof result === "string") {
      log.warn(result);
      continue;
    }
    return value;
  }
}

/**
 * Prompt for API key (password input)
 */
export async function promptApiKey(
  message: string = "Enter API key:",
): Promise<string> {
  return passwordInput({
    message,
    validate: (input: string) => {
      if (input.length === 0) return "API key is required";
      return undefined;
    },
  });
}

/**
 * Prompt for port number
 */
export async function promptPort(
  message: string = "Enter port number:",
  defaultValue: number = 11500,
): Promise<number> {
  const value = await textInput({
    message,
    defaultValue: String(defaultValue),
    validate: (input: string) => {
      const num = Number.parseInt(input, 10);
      if (Number.isNaN(num) || num < 1 || num > 65535) {
        return "Please enter a valid port number (1-65535)";
      }
      return undefined;
    },
  });
  return Number.parseInt(value, 10);
}

/**
 * Prompt for base URL
 */
export async function promptBaseUrl(
  message: string = "Enter base URL:",
  defaultValue: string = "http://127.0.0.1:11500",
): Promise<string> {
  return textInput({
    message,
    defaultValue,
    validate: (input: string) => {
      try {
        new URL(input);
        return undefined;
      } catch {
        return "Please enter a valid URL";
      }
    },
  });
}

/**
 * Prompt for dialect selection
 */
export async function promptDialect(
  message: string = "Select API dialect:",
  _defaultValue: Dialect = "openai_compatible",
): Promise<Dialect> {
  return selectOne<Dialect>({
    message,
    options: [
      {
        value: "openai_compatible",
        label: "OpenAI-compatible",
        hint: "OpenAI, OpenRouter, llama.cpp, etc.",
      },
      {
        value: "anthropic_messages",
        label: "Anthropic Messages API",
        hint: "Claude",
      },
      { value: "mlx_native", label: "MLX Native", hint: "for mlx-vlm" },
    ],
  });
}

/**
 * Prompt for auth type selection
 */
export async function promptAuthType(
  message: string = "Select authentication type:",
  _defaultValue: "none" | "bearer" | "header" = "none",
): Promise<"none" | "bearer" | "header"> {
  return selectOne<"none" | "bearer" | "header">({
    message,
    options: [
      { value: "none", label: "None", hint: "Local servers" },
      {
        value: "bearer",
        label: "Bearer token",
        hint: "Authorization: Bearer ...",
      },
      { value: "header", label: "Custom header", hint: "e.g., x-api-key" },
    ],
  });
}

/**
 * Prompt for custom header name
 */
export async function promptHeaderName(
  message: string = "Enter header name for API key:",
  defaultValue: string = "X-API-Key",
): Promise<string> {
  return textInput({
    message,
    defaultValue,
    validate: (input: string) => {
      if (input.length === 0) return "Header name is required";
      return undefined;
    },
  });
}

/**
 * Prompt for editing provider fields
 */
export async function promptProviderFields(
  currentConfig: ProviderConfig,
): Promise<Partial<ProviderConfig>> {
  const fieldsToEdit = await selectMany<string>({
    message: "Select fields to edit:",
    options: [
      { value: "baseUrl", label: "Base URL" },
      { value: "dialect", label: "Dialect" },
      { value: "auth", label: "Authentication" },
      { value: "engine", label: "Engine" },
    ],
  });

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
        const engine = await textInput({
          message: "New engine (or empty to remove):",
          defaultValue:
            typeof currentConfig.engine === "string"
              ? currentConfig.engine
              : currentConfig.engine?.name || "",
        });
        if (engine) {
          // biome-ignore lint/suspicious/noExplicitAny: engine field accepts string or object
          updates.engine = engine as any;
        }
        break;
      }
    }
  }

  return updates;
}
