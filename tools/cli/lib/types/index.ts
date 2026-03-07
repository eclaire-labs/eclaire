/**
 * Type definitions for admin-cli
 *
 * Re-exports types from @eclaire/ai with CLI-specific aliases and additions.
 */

// Re-export engine types from @eclaire/ai
// Re-export types from @eclaire/ai with CLI-friendly aliases
export type {
  AIContext,
  Dialect,
  EngineConfig,
  InputModality,
  ModelCapabilities,
  ModelConfig as Model,
  ModelPricing,
  ModelSource,
  ModelsConfiguration as ModelsConfig,
  OutputModality,
  ProviderAuth,
  ProviderConfig,
  ProviderOverrides,
  ProvidersConfiguration as ProvidersConfig,
  ReasoningConfig,
  SelectionConfiguration as SelectionConfig,
  TokenizerConfig,
} from "@eclaire/ai";
// Re-export utility types for engine commands
export type {
  DoctorCheck,
  DownloadResult,
} from "./engines.js";

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
    dialect: "openai_compatible" | "mlx_native" | "anthropic_messages";
    baseUrl: string;
    headers?: Record<string, string>;
    auth: {
      type: "none" | "bearer" | "header";
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
