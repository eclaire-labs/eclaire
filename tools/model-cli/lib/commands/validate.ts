import { loadModelsConfig } from '../config/models.js';
import { createIssuesTable } from '../ui/tables.js';
import { colors, icons } from '../ui/colors.js';
import type { CommandOptions, Model, ModelsConfig } from '../types/index.js';

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
    console.log(colors.header(`${icons.gear} Validating Models Configuration\n`));

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

  try {
    const config = loadModelsConfig();

    // Validate overall config structure
    if (!config) {
      issues.push({
        type: 'error',
        message: 'Configuration file is missing or invalid'
      });
      return { valid: false, issues };
    }

    if (!Array.isArray(config.models)) {
      issues.push({
        type: 'error',
        message: 'Models array is missing or invalid'
      });
      return { valid: false, issues };
    }

    // Validate each model
    const modelIds = new Set<string>();
    const modelShortNames = new Set<string>();

    config.models.forEach((model, index) => {
      validateModel(model, index, issues);

      // Check for duplicate IDs
      if (modelIds.has(model.id)) {
        issues.push({
          type: 'error',
          message: `Duplicate model ID found: ${model.id}`,
          modelId: model.id
        });
      } else {
        modelIds.add(model.id);
      }

      // Check for duplicate short names within same provider
      const shortNameKey = `${model.provider}:${model.modelShortName}`;
      if (modelShortNames.has(shortNameKey)) {
        issues.push({
          type: 'warning',
          message: `Duplicate model short name within provider: ${shortNameKey}`,
          modelId: model.id
        });
      } else {
        modelShortNames.add(shortNameKey);
      }
    });

    // Validate active models
    validateActiveModels(config, issues);

    const hasErrors = issues.some(issue => issue.type === 'error');
    return { valid: !hasErrors, issues };

  } catch (error: any) {
    issues.push({
      type: 'error',
      message: `Failed to load configuration: ${error.message}`
    });
    return { valid: false, issues };
  }
}

function validateModel(model: Model, index: number, issues: ValidationIssue[]): void {
  const modelRef = model.id ? `model '${model.id}'` : `model at index ${index}`;

  // Required fields
  if (!model.id || typeof model.id !== 'string' || model.id.trim().length === 0) {
    issues.push({
      type: 'error',
      message: `${modelRef}: ID is required and must be a non-empty string`,
      modelId: model.id
    });
  }


  if (!model.provider || typeof model.provider !== 'string' || model.provider.trim().length === 0) {
    issues.push({
      type: 'error',
      message: `${modelRef}: Provider is required and must be a non-empty string`,
      modelId: model.id
    });
  }

  if (!model.modelShortName || typeof model.modelShortName !== 'string' || model.modelShortName.trim().length === 0) {
    issues.push({
      type: 'error',
      message: `${modelRef}: Model short name is required and must be a non-empty string`,
      modelId: model.id
    });
  }


  // Contexts validation
  if (!Array.isArray(model.contexts) || model.contexts.length === 0) {
    issues.push({
      type: 'error',
      message: `${modelRef}: Contexts must be a non-empty array`,
      modelId: model.id
    });
  } else {
    const validContexts = ['backend', 'workers'];
    const invalidContexts = model.contexts.filter(ctx => !validContexts.includes(ctx));
    if (invalidContexts.length > 0) {
      issues.push({
        type: 'error',
        message: `${modelRef}: Invalid contexts found: ${invalidContexts.join(', ')}. Valid contexts are: ${validContexts.join(', ')}`,
        modelId: model.id
      });
    }
  }

  // Optional field validation
  if (model.maxTokens !== undefined) {
    if (typeof model.maxTokens !== 'number' || model.maxTokens <= 0) {
      issues.push({
        type: 'error',
        message: `${modelRef}: Max tokens must be a positive number`,
        modelId: model.id
      });
    }
  }

  if (model.temperature !== undefined) {
    if (typeof model.temperature !== 'number' || model.temperature < 0 || model.temperature > 2) {
      issues.push({
        type: 'warning',
        message: `${modelRef}: Temperature should be a number between 0 and 2`,
        modelId: model.id
      });
    }
  }

  if (model.inputTokenPrice !== undefined) {
    if (typeof model.inputTokenPrice !== 'number' || model.inputTokenPrice < 0) {
      issues.push({
        type: 'warning',
        message: `${modelRef}: Input token price must be a non-negative number`,
        modelId: model.id
      });
    }
  }

  if (model.outputTokenPrice !== undefined) {
    if (typeof model.outputTokenPrice !== 'number' || model.outputTokenPrice < 0) {
      issues.push({
        type: 'warning',
        message: `${modelRef}: Output token price must be a non-negative number`,
        modelId: model.id
      });
    }
  }

  if (model.tags !== undefined) {
    if (!Array.isArray(model.tags)) {
      issues.push({
        type: 'warning',
        message: `${modelRef}: Tags must be an array`,
        modelId: model.id
      });
    } else {
      const invalidTags = model.tags.filter(tag => typeof tag !== 'string');
      if (invalidTags.length > 0) {
        issues.push({
          type: 'warning',
          message: `${modelRef}: All tags must be strings`,
          modelId: model.id
        });
      }
    }
  }

}

function validateActiveModels(config: ModelsConfig, issues: ValidationIssue[]): void {
  if (!config.activeModels || typeof config.activeModels !== 'object') {
    issues.push({
      type: 'warning',
      message: 'Active models configuration is missing or invalid'
    });
    return;
  }

  const { backend, workers } = config.activeModels;

  // Validate backend active model
  if (backend !== undefined) {
    if (typeof backend !== 'string') {
      issues.push({
        type: 'error',
        message: 'Backend active model must be a string (model ID)'
      });
    } else {
      const backendModel = config.models.find(m => m.id === backend);
      if (!backendModel) {
        issues.push({
          type: 'error',
          message: `Backend active model '${backend}' not found in models list`
        });
      } else {
        if (!backendModel.contexts || !backendModel.contexts.includes('backend')) {
          issues.push({
            type: 'error',
            message: `Backend active model '${backend}' does not support backend context`
          });
        }
      }
    }
  }

  // Validate workers active model
  if (workers !== undefined) {
    if (typeof workers !== 'string') {
      issues.push({
        type: 'error',
        message: 'Workers active model must be a string (model ID)'
      });
    } else {
      const workersModel = config.models.find(m => m.id === workers);
      if (!workersModel) {
        issues.push({
          type: 'error',
          message: `Workers active model '${workers}' not found in models list`
        });
      } else {
        if (!workersModel.contexts || !workersModel.contexts.includes('workers')) {
          issues.push({
            type: 'error',
            message: `Workers active model '${workers}' does not support workers context`
          });
        }
      }
    }
  }
}