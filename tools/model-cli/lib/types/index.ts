export interface Model {
  id: string;
  name?: string; // Make optional since it's not always present in models.json
  provider: string;
  modelShortName: string;
  modelFullName?: string; // Add modelFullName field from models.json
  modelUrl?: string; // Add modelUrl field from models.json
  providerUrl?: string; // Add providerUrl field from models.json
  contexts: string[];
  apiUrl?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  description?: string;
  tags?: string[];
  inputTokenPrice?: number;
  outputTokenPrice?: number;
  metadata?: Record<string, any>;
  capabilities?: Record<string, any>; // Add capabilities field from models.json
}

export interface ModelsConfig {
  models: Model[];
  activeModels: {
    backend?: string;
    workers?: string;
  };
}

export interface CommandOptions {
  context?: string;
  provider?: string;
  json?: boolean;
  backend?: string;
  workers?: string;
  interactive?: boolean;
  force?: boolean;
  fix?: boolean;
}

export type Context = 'backend' | 'workers' | 'both';
export type Provider = 'openrouter' | 'huggingface' | 'openai' | 'anthropic' | string;

