import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ModelsConfig, Model } from '../types/index.js';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize config path from CONFIG_DIR environment variable or fallback to relative path
function getDefaultConfigPath(): string {
  const configDir = process.env.CONFIG_DIR;
  if (configDir) {
    return path.join(configDir, 'models.json');
  }

  // Fallback to relative path from CLI location
  return path.join(__dirname, '..', '..', '..', '..', '..', 'config', 'models.json');
}

// Path to the models.json config file
let MODELS_CONFIG_PATH = getDefaultConfigPath();

/**
 * Set a custom config path (used by CLI --config option)
 */
export function setConfigPath(customPath: string): void {
  MODELS_CONFIG_PATH = path.resolve(customPath);
}

/**
 * Get the current config path
 */
export function getConfigPath(): string {
  return MODELS_CONFIG_PATH;
}

/**
 * Interpolate environment variables in a string
 */
function interpolateEnvVars(str: string): string {
  if (typeof str !== 'string') return str;

  return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      console.warn(`Environment variable ${varName} not found for interpolation`);
      return match;
    }
    return value;
  });
}

/**
 * Load models configuration from JSON file
 */
export function loadModelsConfig(): ModelsConfig {
  try {
    if (!fs.existsSync(MODELS_CONFIG_PATH)) {
      console.warn(`Models config file not found at: ${MODELS_CONFIG_PATH}`);
      return { models: [], activeModels: {} };
    }

    const configData = fs.readFileSync(MODELS_CONFIG_PATH, 'utf8');
    const rawConfig = JSON.parse(configData);


    // Ensure activeModels exists
    if (!rawConfig.activeModels) {
      rawConfig.activeModels = {};
    }

    const config: ModelsConfig = rawConfig;

    // Return raw config without interpolating environment variables
    // The CLI should preserve placeholders like ${VAR} for runtime interpolation
    return config;
  } catch (error) {
    console.error('Error loading models config:', error);
    return { models: [], activeModels: {} };
  }
}

/**
 * Save models configuration to JSON file
 */
export function saveModelsConfig(config: ModelsConfig): void {
  try {
    // Ensure directory exists
    const configDir = path.dirname(MODELS_CONFIG_PATH);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // Save configuration
    fs.writeFileSync(MODELS_CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving models config:', error);
    throw error;
  }
}

/**
 * Find a model by ID
 */
export function findModelById(id: string): Model | undefined {
  const config = loadModelsConfig();
  return config.models.find(model => model.id === id);
}

/**
 * Get all models with optional filtering
 */
export function getModels(filter?: {
  context?: string;
  provider?: string;
}): Model[] {
  const config = loadModelsConfig();
  let models = config.models;

  if (filter) {
    if (filter.context) {
      models = models.filter(model =>
        model.contexts && model.contexts.includes(filter.context!)
      );
    }
    if (filter.provider) {
      models = models.filter(model => model.provider === filter.provider);
    }
  }

  return models;
}

/**
 * Add a new model to the configuration
 */
export function addModel(model: Model): void {
  const config = loadModelsConfig();

  // Check if model already exists
  const existingModel = config.models.find(m => m.id === model.id);
  if (existingModel) {
    throw new Error(`Model with ID ${model.id} already exists`);
  }

  config.models.push(model);
  saveModelsConfig(config);
}

/**
 * Update an existing model
 */
export function updateModel(id: string, updates: Partial<Model>): void {
  const config = loadModelsConfig();
  const modelIndex = config.models.findIndex(model => model.id === id);

  if (modelIndex === -1) {
    throw new Error(`Model with ID ${id} not found`);
  }

  const updatedModel = { ...config.models[modelIndex], ...updates };
  // Ensure required fields are present
  if (!updatedModel.id || !updatedModel.name || !updatedModel.provider || !updatedModel.modelShortName) {
    throw new Error('Cannot update model: missing required fields');
  }

  config.models[modelIndex] = updatedModel as Model;
  saveModelsConfig(config);
}

/**
 * Remove a model from the configuration
 */
export function removeModel(id: string): void {
  const config = loadModelsConfig();
  const modelIndex = config.models.findIndex(model => model.id === id);

  if (modelIndex === -1) {
    throw new Error(`Model with ID ${id} not found`);
  }

  config.models.splice(modelIndex, 1);

  // Remove from active models if it was active
  if (config.activeModels.backend === id) {
    delete config.activeModels.backend;
  }
  if (config.activeModels.workers === id) {
    delete config.activeModels.workers;
  }

  saveModelsConfig(config);
}

/**
 * Set active model for a context using model ID
 */
export function setActiveModel(context: 'backend' | 'workers', modelId: string): void {
  const config = loadModelsConfig();
  const model = config.models.find(m => m.id === modelId);

  if (!model) {
    throw new Error(`Model with ID ${modelId} not found`);
  }

  const modelContexts = model.contexts || [];
  if (!modelContexts.includes(context)) {
    throw new Error(`Model ${modelId} is not available for context ${context}`);
  }


  config.activeModels[context] = modelId;
  saveModelsConfig(config);
}

/**
 * Set active model for a context using provider and model short name
 */
export function setActiveModelByProvider(context: 'backend' | 'workers', provider: string, modelShortName: string): Model {
  const config = loadModelsConfig();
  const model = config.models.find(m =>
    m.provider === provider &&
    m.modelShortName === modelShortName &&
    (m.contexts && m.contexts.includes(context))
  );

  if (!model) {
    throw new Error(`No model found for ${provider}:${modelShortName} in ${context} context`);
  }

  config.activeModels[context] = model.id;
  saveModelsConfig(config);
  return model;
}

/**
 * Remove active model for a context
 */
export function removeActiveModel(context: 'backend' | 'workers'): void {
  const config = loadModelsConfig();
  delete config.activeModels[context];
  saveModelsConfig(config);
}

/**
 * Get active model for a context
 */
export function getActiveModel(context: 'backend' | 'workers'): Model | undefined {
  const config = loadModelsConfig();
  const activeModelId = config.activeModels[context];

  if (!activeModelId) {
    return undefined;
  }

  return config.models.find(model => model.id === activeModelId);
}

/**
 * Get all active models
 */
export function getActiveModels(): { backend?: string; workers?: string } {
  const config = loadModelsConfig();
  return config.activeModels;
}

/**
 * Get active models as objects with provider and modelShortName
 */
export function getActiveModelsAsObjects(): { backend?: { provider: string; modelShortName: string }; workers?: { provider: string; modelShortName: string } } {
  const config = loadModelsConfig();
  const result: { backend?: { provider: string; modelShortName: string }; workers?: { provider: string; modelShortName: string } } = {};

  if (config.activeModels.backend) {
    const model = config.models.find(m => m.id === config.activeModels.backend);
    if (model) {
      result.backend = { provider: model.provider, modelShortName: model.modelShortName };
    }
  }

  if (config.activeModels.workers) {
    const model = config.models.find(m => m.id === config.activeModels.workers);
    if (model) {
      result.workers = { provider: model.provider, modelShortName: model.modelShortName };
    }
  }

  return result;
}

