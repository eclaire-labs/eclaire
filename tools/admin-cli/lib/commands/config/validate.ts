import {
  isModelSuitableForBackend,
  isModelSuitableForWorkers,
  loadModelsConfig,
  loadProvidersConfig,
  loadSelectionConfig,
} from "../../config/models.js";
import type {
  CommandOptions,
  Model,
  ProviderConfig,
} from "../../types/index.js";
import { colors, icons } from "../../ui/colors.js";
import { createIssuesTable } from "../../ui/tables.js";

interface ValidationIssue {
  type: "error" | "warning";
  message: string;
  modelId?: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export async function validateCommand(_options: CommandOptions): Promise<void> {
  try {
    console.log(colors.header(`${icons.gear} Validating AI Configuration\n`));

    const result = validateConfig();

    if (result.valid) {
      console.log(colors.success(`${icons.success} Configuration is valid!`));

      if (result.issues.length > 0) {
        console.log(colors.subheader("\nWarnings:"));
        console.log(createIssuesTable(result.issues));
      }
    } else {
      console.log(colors.error(`${icons.error} Configuration has issues:\n`));
      console.log(createIssuesTable(result.issues));
      process.exit(1);
    }
  } catch (error: any) {
    console.log(
      colors.error(
        `${icons.error} Failed to validate configuration: ${error.message}`,
      ),
    );
    process.exit(1);
  }
}

function validateConfig(): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Load all configs
  let providersConfig;
  let modelsConfig;
  let selectionConfig;

  try {
    providersConfig = loadProvidersConfig();
  } catch (error: any) {
    issues.push({
      type: "error",
      message: `Failed to load providers.json: ${error.message}`,
    });
    return { valid: false, issues };
  }

  try {
    modelsConfig = loadModelsConfig();
  } catch (error: any) {
    issues.push({
      type: "error",
      message: `Failed to load models.json: ${error.message}`,
    });
    return { valid: false, issues };
  }

  try {
    selectionConfig = loadSelectionConfig();
  } catch (error: any) {
    issues.push({
      type: "error",
      message: `Failed to load selection.json: ${error.message}`,
    });
    return { valid: false, issues };
  }

  // Validate providers config structure
  if (
    !providersConfig.providers ||
    typeof providersConfig.providers !== "object"
  ) {
    issues.push({
      type: "error",
      message: 'providers.json: Missing or invalid "providers" object',
    });
  } else {
    // Validate each provider
    for (const [providerId, provider] of Object.entries(
      providersConfig.providers,
    )) {
      validateProvider(providerId, provider, issues);
    }
  }

  // Validate models config structure
  if (!modelsConfig.models || typeof modelsConfig.models !== "object") {
    issues.push({
      type: "error",
      message: 'models.json: Missing or invalid "models" object',
    });
  } else {
    // Validate each model
    for (const [modelId, model] of Object.entries(modelsConfig.models)) {
      validateModel(modelId, model, providersConfig.providers, issues);
    }
  }

  // Validate selection config
  if (!selectionConfig.active || typeof selectionConfig.active !== "object") {
    issues.push({
      type: "warning",
      message: 'selection.json: Missing or invalid "active" object',
    });
  } else {
    validateSelection(selectionConfig.active, modelsConfig.models, issues);
  }

  const hasErrors = issues.some((issue) => issue.type === "error");
  return { valid: !hasErrors, issues };
}

function validateProvider(
  providerId: string,
  provider: ProviderConfig,
  issues: ValidationIssue[],
): void {
  const ref = `provider '${providerId}'`;

  // Validate dialect
  if (!provider.dialect) {
    issues.push({
      type: "error",
      message: `${ref}: Missing dialect`,
    });
  } else if (
    !["openai_compatible", "mlx_native", "anthropic_messages"].includes(
      provider.dialect,
    )
  ) {
    issues.push({
      type: "warning",
      message: `${ref}: Unknown dialect '${provider.dialect}'. Expected 'openai_compatible', 'mlx_native', or 'anthropic_messages'`,
    });
  }

  // Validate baseUrl
  if (!provider.baseUrl) {
    issues.push({
      type: "error",
      message: `${ref}: Missing baseUrl`,
    });
  }

  // Validate auth
  if (!provider.auth) {
    issues.push({
      type: "error",
      message: `${ref}: Missing auth configuration`,
    });
  } else {
    if (!provider.auth.type) {
      issues.push({
        type: "error",
        message: `${ref}: Missing auth.type`,
      });
    } else if (!["none", "bearer", "header"].includes(provider.auth.type)) {
      issues.push({
        type: "error",
        message: `${ref}: Invalid auth.type '${provider.auth.type}'. Expected 'none', 'bearer', or 'header'`,
      });
    }
  }

  // Validate headers (optional)
  if (provider.headers !== undefined) {
    if (
      typeof provider.headers !== "object" ||
      provider.headers === null ||
      Array.isArray(provider.headers)
    ) {
      issues.push({
        type: "error",
        message: `${ref}: headers must be an object`,
      });
    } else {
      for (const [key, value] of Object.entries(provider.headers)) {
        if (typeof value !== "string") {
          issues.push({
            type: "warning",
            message: `${ref}: headers.${key} should be a string`,
          });
        }
      }
    }
  }

  // Validate overrides (optional)
  if (provider.overrides !== undefined) {
    if (
      typeof provider.overrides !== "object" ||
      provider.overrides === null ||
      Array.isArray(provider.overrides)
    ) {
      issues.push({
        type: "error",
        message: `${ref}: overrides must be an object`,
      });
    } else {
      if (
        provider.overrides.reasoningFields !== undefined &&
        !Array.isArray(provider.overrides.reasoningFields)
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: overrides.reasoningFields should be an array of strings`,
        });
      }
      if (
        provider.overrides.chatPath !== undefined &&
        typeof provider.overrides.chatPath !== "string"
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: overrides.chatPath should be a string`,
        });
      }
      if (
        provider.overrides.modelsPath !== undefined &&
        typeof provider.overrides.modelsPath !== "string"
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: overrides.modelsPath should be a string`,
        });
      }
    }
  }

  // Validate engine (optional - for local providers)
  if (provider.engine !== undefined) {
    if (
      typeof provider.engine !== "object" ||
      provider.engine === null ||
      Array.isArray(provider.engine)
    ) {
      issues.push({
        type: "error",
        message: `${ref}: engine must be an object`,
      });
    } else {
      if (typeof provider.engine.managed !== "boolean") {
        issues.push({
          type: "error",
          message: `${ref}: engine.managed must be a boolean`,
        });
      }
      if (
        !provider.engine.name ||
        typeof provider.engine.name !== "string" ||
        provider.engine.name.trim().length === 0
      ) {
        issues.push({
          type: "error",
          message: `${ref}: engine.name must be a non-empty string`,
        });
      }
      if (
        provider.engine.gpuLayers !== undefined &&
        typeof provider.engine.gpuLayers !== "number"
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: engine.gpuLayers should be a number`,
        });
      }
      if (
        provider.engine.contextSize !== undefined &&
        typeof provider.engine.contextSize !== "number"
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: engine.contextSize should be a number`,
        });
      }
      if (
        provider.engine.batchSize !== undefined &&
        typeof provider.engine.batchSize !== "number"
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: engine.batchSize should be a number`,
        });
      }
      if (
        provider.engine.flashAttention !== undefined &&
        typeof provider.engine.flashAttention !== "boolean"
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: engine.flashAttention should be a boolean`,
        });
      }
      if (provider.engine.extraArgs !== undefined) {
        if (!Array.isArray(provider.engine.extraArgs)) {
          issues.push({
            type: "warning",
            message: `${ref}: engine.extraArgs should be an array of strings`,
          });
        }
      }
    }
  }
}

function validateModel(
  modelId: string,
  model: Model,
  providers: Record<string, ProviderConfig>,
  issues: ValidationIssue[],
): void {
  const ref = `model '${modelId}'`;

  // Required fields
  if (
    !model.name ||
    typeof model.name !== "string" ||
    model.name.trim().length === 0
  ) {
    issues.push({
      type: "error",
      message: `${ref}: Missing or invalid 'name' field`,
      modelId,
    });
  }

  if (
    !model.provider ||
    typeof model.provider !== "string" ||
    model.provider.trim().length === 0
  ) {
    issues.push({
      type: "error",
      message: `${ref}: Missing or invalid 'provider' field`,
      modelId,
    });
  } else {
    // Check provider exists
    if (!providers[model.provider]) {
      issues.push({
        type: "error",
        message: `${ref}: Provider '${model.provider}' not found in providers.json`,
        modelId,
      });
    }
  }

  if (
    !model.providerModel ||
    typeof model.providerModel !== "string" ||
    model.providerModel.trim().length === 0
  ) {
    issues.push({
      type: "error",
      message: `${ref}: Missing or invalid 'providerModel' field`,
      modelId,
    });
  }

  // Validate capabilities
  if (!model.capabilities || typeof model.capabilities !== "object") {
    issues.push({
      type: "error",
      message: `${ref}: Missing or invalid 'capabilities' object`,
      modelId,
    });
  } else {
    if (
      typeof model.capabilities.contextWindow !== "number" ||
      model.capabilities.contextWindow <= 0
    ) {
      issues.push({
        type: "error",
        message: `${ref}: capabilities.contextWindow must be a positive number`,
        modelId,
      });
    }

    if (
      !model.capabilities.modalities ||
      !model.capabilities.modalities.input ||
      !model.capabilities.modalities.output
    ) {
      issues.push({
        type: "error",
        message: `${ref}: capabilities.modalities must have input and output arrays`,
        modelId,
      });
    }

    // Validate boolean flags
    const boolFlags = ["streaming", "tools", "jsonSchema", "structuredOutputs"];
    for (const flag of boolFlags) {
      if (typeof (model.capabilities as any)[flag] !== "boolean") {
        issues.push({
          type: "warning",
          message: `${ref}: capabilities.${flag} should be a boolean`,
          modelId,
        });
      }
    }

    // Validate reasoning object
    if (
      !model.capabilities.reasoning ||
      typeof model.capabilities.reasoning !== "object"
    ) {
      issues.push({
        type: "warning",
        message: `${ref}: capabilities.reasoning should be an object with 'supported' boolean`,
        modelId,
      });
    } else if (typeof model.capabilities.reasoning.supported !== "boolean") {
      issues.push({
        type: "warning",
        message: `${ref}: capabilities.reasoning.supported should be a boolean`,
        modelId,
      });
    }
  }

  // Note: suitability is now derived from capabilities.modalities
  // Backend: requires text input, Workers: requires text + image input

  // Validate source
  if (!model.source || typeof model.source !== "object") {
    issues.push({
      type: "error",
      message: `${ref}: Missing or invalid 'source' object`,
      modelId,
    });
  } else {
    if (!model.source.url || typeof model.source.url !== "string") {
      issues.push({
        type: "error",
        message: `${ref}: source.url is required`,
        modelId,
      });
    }
  }

  // Validate pricing (optional but if present must be valid)
  if (model.pricing !== undefined && model.pricing !== null) {
    if (typeof model.pricing !== "object") {
      issues.push({
        type: "warning",
        message: `${ref}: pricing must be an object or null`,
        modelId,
      });
    } else {
      if (
        typeof model.pricing.inputPer1M !== "number" ||
        model.pricing.inputPer1M < 0
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: pricing.inputPer1M must be a non-negative number`,
          modelId,
        });
      }
      if (
        typeof model.pricing.outputPer1M !== "number" ||
        model.pricing.outputPer1M < 0
      ) {
        issues.push({
          type: "warning",
          message: `${ref}: pricing.outputPer1M must be a non-negative number`,
          modelId,
        });
      }
    }
  }
}

function validateSelection(
  active: { backend?: string; workers?: string },
  models: Record<string, Model>,
  issues: ValidationIssue[],
): void {
  // Validate backend selection
  if (active.backend) {
    const model = models[active.backend];
    if (!model) {
      issues.push({
        type: "error",
        message: `selection.json: Backend active model '${active.backend}' not found in models.json`,
      });
    } else if (!isModelSuitableForBackend(model)) {
      issues.push({
        type: "error",
        message: `selection.json: Backend active model '${active.backend}' is not suitable for backend context (requires text input)`,
      });
    }
  }

  // Validate workers selection
  if (active.workers) {
    const model = models[active.workers];
    if (!model) {
      issues.push({
        type: "error",
        message: `selection.json: Workers active model '${active.workers}' not found in models.json`,
      });
    } else if (!isModelSuitableForWorkers(model)) {
      issues.push({
        type: "error",
        message: `selection.json: Workers active model '${active.workers}' is not suitable for workers context (requires text + image input)`,
      });
    }
  }
}
