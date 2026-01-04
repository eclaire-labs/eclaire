/**
 * Type definitions for admin-cli
 *
 * Re-exports types from @eclaire/ai with CLI-specific aliases and additions.
 */

// Re-export utility types for engine commands
export type {
  DoctorCheck,
  DownloadResult,
} from './engines.js';

// Re-export engine types from @eclaire/ai
export type { EngineConfig } from '@eclaire/ai';

// Re-export types from @eclaire/ai with CLI-friendly aliases
export type {
  Dialect,
  ProviderAuth,
  ProviderOverrides,
  ProviderConfig,
  ProvidersConfiguration as ProvidersConfig,
  InputModality,
  OutputModality,
  ReasoningConfig,
  ModelCapabilities,
  TokenizerConfig,
  ModelSource,
  ModelPricing,
  ModelConfig as Model,
  ModelsConfiguration as ModelsConfig,
  AIContext,
  SelectionConfiguration as SelectionConfig,
} from '@eclaire/ai';

// ============================================================================
// CLI-specific types
// ============================================================================

/**
 * Command options passed to CLI commands
 */
export interface CommandOptions {
  context?: string;
  provider?: string;
  json?: boolean;
  backend?: string;
  workers?: string;
  interactive?: boolean;
  force?: boolean;
  fix?: boolean;
  preset?: string;
  timeout?: string;
  memory?: boolean;
}

/**
 * Context type for CLI commands (includes "both" option)
 */
export type Context = "backend" | "workers" | "both";

/**
 * Provider preset definition
 */
export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  isCloud: boolean;
  defaultPort?: number;
  /** Default engine settings for managed local providers */
  defaultEngine?: {
    name: string;
    gpuLayers?: number;
    contextSize?: number;
    batchSize?: number;
  };
  config: {
    dialect: 'openai_compatible' | 'mlx_native' | 'anthropic_messages';
    baseUrl: string;
    headers?: Record<string, string>;
    auth: {
      type: 'none' | 'bearer' | 'header';
      requiresApiKey: boolean;
      /** Environment variable name for the API key (e.g., 'OPENAI_API_KEY') */
      envVar?: string;
    };
    overrides?: {
      reasoningFields?: string[];
      chatPath?: string;
      modelsPath?: string;
    };
  };
}
