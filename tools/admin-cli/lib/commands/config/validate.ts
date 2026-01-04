import { loadModelsConfig, loadProvidersConfig, loadSelectionConfig, isModelSuitableForBackend, isModelSuitableForWorkers } from '../../config/models.js';
import { createIssuesTable } from '../../ui/tables.js';
import { colors, icons } from '../../ui/colors.js';
import type { CommandOptions, Model, ProviderConfig } from '../../types/index.js';

interface ValidationIssue {
  type: 'error' | 'warning';
  message: string;
  modelId?: string;
}

interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export async function validateCommand(options: CommandOptions): Promise<void> {
  try {
    console.log(colors.header(`${icons.gear} Validating AI Configuration\n`));

    const result = validateConfig();

    if (result.valid) {
      console.log(colors.success(`${icons.success} Configuration is valid!`));

      if (result.issues.length > 0) {
        console.log(colors.subheader('\nWarnings:'));
        console.log(createIssuesTable(result.issues));
      }
    } else {
      console.log(colors.error(`${icons.error} Configuration has issues:\n`));
      console.log(createIssuesTable(result.issues));

      if (options.fix) {
        console.log(colors.warning(`${icons.warning} Auto-fix not yet implemented`));
        console.log(colors.dim('Please resolve issues manually and run validation again'));
      }

      process.exit(1);
    }

  } catch (error: any) {
    console.log(colors.error(`${icons.error} Failed to validate configuration: ${error.message}`));
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
      type: 'error',
      message: `Failed to load providers.json: ${error.message}`
    });
    return { valid: false, issues };
  }

  try {
    modelsConfig = loadModelsConfig();
  } catch (error: any) {
    issues.push({
      type: 'error',
      message: `Failed to load models.json: ${error.message}`
    });
    return { valid: false, issues };
  }

  try {
    selectionConfig = loadSelectionConfig();
  } catch (error: any) {
    issues.push({
      type: 'error',
      message: `Failed to load selection.json: ${error.message}`
    });
    return { valid: false, issues };
  }

  // Validate providers config structure
  if (!providersConfig.providers || typeof providersConfig.providers !== 'object') {
    issues.push({
      type: 'error',
      message: 'providers.json: Missing or invalid "providers" object'
    });
  } else {
    // Validate each provider
    for (const [providerId, provider] of Object.entries(providersConfig.providers)) {
      validateProvider(providerId, provider, issues);
    }
  }

  // Validate models config structure
  if (!modelsConfig.models || typeof modelsConfig.models !== 'object') {
    issues.push({
      type: 'error',
      message: 'models.json: Missing or invalid "models" object'
    });
  } else {
    // Validate each model
    for (const [modelId, model] of Object.entries(modelsConfig.models)) {
      validateModel(modelId, model, providersConfig.providers, issues);
    }
  }

  // Validate selection config
  if (!selectionConfig.active || typeof selectionConfig.active !== 'object') {
    issues.push({
      type: 'warning',
      message: 'selection.json: Missing or invalid "active" object'
    });
  } else {
    validateSelection(selectionConfig.active, modelsConfig.models, issues);
  }

  const hasErrors = issues.some(issue => issue.type === 'error');
  return { valid: !hasErrors, issues };
}

function validateProvider(
  providerId: string,
  provider: ProviderConfig,
  issues: ValidationIssue[]
): void {
  const ref = `provider '${providerId}'`;

  // Validate dialect
  if (!provider.dialect) {
    issues.push({
      type: 'error',
      message: `${ref}: Missing dialect`
    });
  } else if (!['openai-chat', 'mlx-responses'].includes(provider.dialect)) {
    issues.push({
      type: 'warning',
      message: `${ref}: Unknown dialect '${provider.dialect}'. Expected 'openai-chat' or 'mlx-responses'`
    });
  }

  // Validate baseUrl
  if (!provider.baseUrl) {
    issues.push({
      type: 'error',
      message: `${ref}: Missing baseUrl`
    });
  }

  // Validate auth
  if (!provider.auth) {
    issues.push({
      type: 'error',
      message: `${ref}: Missing auth configuration`
    });
  } else {
    if (!provider.auth.type) {
      issues.push({
        type: 'error',
        message: `${ref}: Missing auth.type`
      });
    } else if (!['none', 'bearer', 'api-key-header'].includes(provider.auth.type)) {
      issues.push({
        type: 'error',
        message: `${ref}: Invalid auth.type '${provider.auth.type}'. Expected 'none', 'bearer', or 'api-key-header'`
      });
    }
  }
}

function validateModel(
  modelId: string,
  model: Model,
  providers: Record<string, ProviderConfig>,
  issues: ValidationIssue[]
): void {
  const ref = `model '${modelId}'`;

  // Required fields
  if (!model.name || typeof model.name !== 'string' || model.name.trim().length === 0) {
    issues.push({
      type: 'error',
      message: `${ref}: Missing or invalid 'name' field`,
      modelId
    });
  }

  if (!model.provider || typeof model.provider !== 'string' || model.provider.trim().length === 0) {
    issues.push({
      type: 'error',
      message: `${ref}: Missing or invalid 'provider' field`,
      modelId
    });
  } else {
    // Check provider exists
    if (!providers[model.provider]) {
      issues.push({
        type: 'error',
        message: `${ref}: Provider '${model.provider}' not found in providers.json`,
        modelId
      });
    }
  }

  if (!model.providerModel || typeof model.providerModel !== 'string' || model.providerModel.trim().length === 0) {
    issues.push({
      type: 'error',
      message: `${ref}: Missing or invalid 'providerModel' field`,
      modelId
    });
  }

  // Validate capabilities
  if (!model.capabilities || typeof model.capabilities !== 'object') {
    issues.push({
      type: 'error',
      message: `${ref}: Missing or invalid 'capabilities' object`,
      modelId
    });
  } else {
    if (typeof model.capabilities.contextWindow !== 'number' || model.capabilities.contextWindow <= 0) {
      issues.push({
        type: 'error',
        message: `${ref}: capabilities.contextWindow must be a positive number`,
        modelId
      });
    }

    if (!model.capabilities.modalities || !model.capabilities.modalities.input || !model.capabilities.modalities.output) {
      issues.push({
        type: 'error',
        message: `${ref}: capabilities.modalities must have input and output arrays`,
        modelId
      });
    }

    // Validate boolean flags
    const boolFlags = ['streaming', 'tools', 'jsonSchema', 'structuredOutputs'];
    for (const flag of boolFlags) {
      if (typeof (model.capabilities as any)[flag] !== 'boolean') {
        issues.push({
          type: 'warning',
          message: `${ref}: capabilities.${flag} should be a boolean`,
          modelId
        });
      }
    }

    // Validate reasoning object
    if (!model.capabilities.reasoning || typeof model.capabilities.reasoning !== 'object') {
      issues.push({
        type: 'warning',
        message: `${ref}: capabilities.reasoning should be an object with 'supported' boolean`,
        modelId
      });
    } else if (typeof model.capabilities.reasoning.supported !== 'boolean') {
      issues.push({
        type: 'warning',
        message: `${ref}: capabilities.reasoning.supported should be a boolean`,
        modelId
      });
    }
  }

  // Note: suitability is now derived from capabilities.modalities
  // Backend: requires text input, Workers: requires text + image input

  // Validate source
  if (!model.source || typeof model.source !== 'object') {
    issues.push({
      type: 'error',
      message: `${ref}: Missing or invalid 'source' object`,
      modelId
    });
  } else {
    if (!model.source.url || typeof model.source.url !== 'string') {
      issues.push({
        type: 'error',
        message: `${ref}: source.url is required`,
        modelId
      });
    }
  }

  // Validate pricing (optional but if present must be valid)
  if (model.pricing !== undefined && model.pricing !== null) {
    if (typeof model.pricing !== 'object') {
      issues.push({
        type: 'warning',
        message: `${ref}: pricing must be an object or null`,
        modelId
      });
    } else {
      if (typeof model.pricing.inputPer1M !== 'number' || model.pricing.inputPer1M < 0) {
        issues.push({
          type: 'warning',
          message: `${ref}: pricing.inputPer1M must be a non-negative number`,
          modelId
        });
      }
      if (typeof model.pricing.outputPer1M !== 'number' || model.pricing.outputPer1M < 0) {
        issues.push({
          type: 'warning',
          message: `${ref}: pricing.outputPer1M must be a non-negative number`,
          modelId
        });
      }
    }
  }
}

function validateSelection(
  active: { backend?: string; workers?: string },
  models: Record<string, Model>,
  issues: ValidationIssue[]
): void {
  // Validate backend selection
  if (active.backend) {
    const model = models[active.backend];
    if (!model) {
      issues.push({
        type: 'error',
        message: `selection.json: Backend active model '${active.backend}' not found in models.json`
      });
    } else if (!isModelSuitableForBackend(model)) {
      issues.push({
        type: 'error',
        message: `selection.json: Backend active model '${active.backend}' is not suitable for backend context (requires text input)`
      });
    }
  }

  // Validate workers selection
  if (active.workers) {
    const model = models[active.workers];
    if (!model) {
      issues.push({
        type: 'error',
        message: `selection.json: Workers active model '${active.workers}' not found in models.json`
      });
    } else if (!isModelSuitableForWorkers(model)) {
      issues.push({
        type: 'error',
        message: `selection.json: Workers active model '${active.workers}' is not suitable for workers context (requires text + image input)`
      });
    }
  }
}
