/**
 * AI Import Types
 *
 * Shared type definitions for the model import system.
 * Used by ai-import.ts, ai-provider-presets.ts, and admin routes.
 */

import type { ModelCapabilities, ModelSource } from "@eclaire/ai";

// =============================================================================
// Provider Presets
// =============================================================================

/**
 * Provider preset information returned by GET /api/admin/provider-presets.
 */
export interface ProviderPresetInfo {
  id: string;
  name: string;
  description: string;
  isCloud: boolean;
  supportsCatalogDiscovery: boolean;
  defaultPort?: number;
  defaultEngine?: {
    name: string;
    gpuLayers?: number;
  };
  config: {
    dialect: string;
    baseUrl: string;
    headers?: Record<string, string>;
    auth: {
      type: string;
      requiresApiKey: boolean;
      envVar?: string;
    };
  };
}

// =============================================================================
// Catalog Discovery
// =============================================================================

/**
 * A single model from a provider's catalog (e.g. OpenRouter /models).
 */
export interface CatalogModel {
  providerModel: string;
  name: string;
  contextWindow?: number;
  inputModalities: string[];
  tools?: boolean;
  jsonSchema?: boolean;
  structuredOutputs?: boolean;
  sourceUrl?: string;
}

// =============================================================================
// URL Inspection
// =============================================================================

export interface QuantizationInfo {
  id: string;
  filename: string;
  sizeBytes: number;
}

export interface ModelArchitectureInfo {
  layers: number;
  kvHeads: number;
  headDim?: number;
  maxPositionEmbeddings?: number;
  slidingWindow?: number;
  slidingWindowPattern?: number;
}

/**
 * Result of inspecting a HuggingFace or OpenRouter URL.
 */
export interface InspectUrlResult {
  sourceType: "huggingface" | "openrouter";
  candidate: {
    suggestedModelId: string;
    name: string;
    providerModel: string;
    capabilities: Partial<ModelCapabilities>;
    source: Partial<ModelSource>;
    quantizations?: QuantizationInfo[];
    architecture?: ModelArchitectureInfo;
    visionSizeBytes?: number;
  };
}

// =============================================================================
// Import
// =============================================================================

/**
 * A single model entry in an import request.
 */
export interface ImportModelEntry {
  id: string;
  name: string;
  provider: string;
  providerModel: string;
  capabilities: ModelCapabilities;
  source?: Partial<ModelSource>;
  pricing?: { inputPer1M: number; outputPer1M: number } | null;
}

/**
 * Request body for POST /api/admin/models/import.
 */
export interface ImportModelsRequest {
  models: ImportModelEntry[];
  setDefaults?: {
    backend?: string;
    workers?: string;
  };
}

/**
 * Response from POST /api/admin/models/import.
 */
export interface ImportModelsResult {
  created: string[];
  skipped: string[];
  defaults: Record<string, string>;
}
