/**
 * AI Import Service
 *
 * Backend-owned logic for model import, URL inspection, and catalog discovery.
 * Extracted from CLI tools/cli/lib/commands/model/import.ts — stripped of
 * terminal UI (no ora, no clack, no process.exit).
 *
 * Frontend and CLI consume this via admin API endpoints.
 */

import axios from "axios";
import type { InputModality, ModelConfig } from "@eclaire/ai";
import { interpolateEnvVars } from "@eclaire/ai";
import { ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import type {
  CatalogModel,
  ImportModelEntry,
  InspectUrlResult,
  ModelArchitectureInfo,
  QuantizationInfo,
} from "./ai-import-types.js";

const logger = createChildLogger("services:ai-import");

const USER_AGENT = "eclaire/1.0.0";
const FETCH_TIMEOUT = 15000;

// =============================================================================
// URL Classification
// =============================================================================

/**
 * Classify an import URL as huggingface, openrouter, or unsupported.
 */
export function getUrlType(url: string): "huggingface" | "openrouter" | null {
  if (url.includes("huggingface.co")) return "huggingface";
  if (url.includes("openrouter.ai")) return "openrouter";
  return null;
}

/**
 * Check whether a string is a valid URL.
 */
export function isValidImportUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Capability Detection
// =============================================================================

/**
 * Detect vision support from various signals.
 */
export function hasVisionSupport(
  tags: string[] = [],
  pipelineTag?: string,
  // biome-ignore lint/suspicious/noExplicitAny: external API response
  architecture?: any,
): boolean {
  if (
    tags.includes("image-text-to-text") ||
    pipelineTag === "image-text-to-text"
  ) {
    return true;
  }
  if (
    architecture?.input_modalities &&
    Array.isArray(architecture.input_modalities)
  ) {
    return architecture.input_modalities.includes("image");
  }
  return false;
}

// =============================================================================
// Parsing Utilities
// =============================================================================

/**
 * Extract quantization type from a GGUF filename.
 */
export function extractQuantizationType(filename: string): string {
  const match = filename.match(
    /[.-](Q\d+_[KM](?:_[XLMS]+)?|F16|F32|Q\d+_\d+|IQ\d+_[MNXSL]+)(?:[.-]|\.gguf)/i,
  );
  return match?.[1]?.toUpperCase() || "UNKNOWN";
}

/**
 * Extract max tokens / context window from HuggingFace model data.
 */
// biome-ignore lint/suspicious/noExplicitAny: external API response
export function extractMaxTokens(huggingFaceData: any): number | undefined {
  if (huggingFaceData.cardData?.max_position_embeddings) {
    return huggingFaceData.cardData.max_position_embeddings;
  }
  if (huggingFaceData.config?.max_position_embeddings) {
    return huggingFaceData.config.max_position_embeddings;
  }
  const description = (
    huggingFaceData.cardData?.description ||
    huggingFaceData.description ||
    ""
  ).toLowerCase();
  const contextMatch = description.match(
    /(\d+)k?\s*context|context.*?(\d+)k?|(\d+)k?\s*tokens/i,
  );
  if (contextMatch) {
    const num = Number.parseInt(
      contextMatch[1] || contextMatch[2] || contextMatch[3],
      10,
    );
    return num > 100 ? num : num * 1000;
  }
  return undefined;
}

/**
 * Format bytes into a human-readable size string.
 */
export function formatFileSize(bytes: number): string {
  if (!bytes) return "Unknown";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

/**
 * Generate a model ID in provider:model-name format.
 */
export function generateModelId(
  provider: string,
  name: string,
  quantization?: string,
): string {
  let modelPart = name.split("/").pop() || name;
  modelPart = modelPart
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (quantization) {
    const normalizedQuant = quantization.toLowerCase().replace(/_/g, "-");
    modelPart += `-${normalizedQuant}`;
  }
  return `${provider}:${modelPart}`;
}

// =============================================================================
// Architecture Fetching (HuggingFace)
// =============================================================================

/**
 * Try to fetch architecture info from a HuggingFace model's config.json.
 */
async function tryFetchArchitectureFromRepo(
  modelId: string,
): Promise<ModelArchitectureInfo | undefined> {
  try {
    const response = await axios.get(
      `https://huggingface.co/${modelId}/raw/main/config.json`,
      {
        headers: { "User-Agent": USER_AGENT },
        timeout: FETCH_TIMEOUT,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );

    // biome-ignore lint/suspicious/noExplicitAny: external API response
    const config = response.data as any;
    const textConfig = config.text_config || config;

    const layers =
      textConfig.num_hidden_layers ||
      textConfig.n_layer ||
      textConfig.num_layers;
    const kvHeads =
      textConfig.num_key_value_heads ||
      textConfig.n_head_kv ||
      textConfig.num_kv_heads;
    const numHeads = textConfig.num_attention_heads || textConfig.n_head;
    const hiddenSize = textConfig.hidden_size || textConfig.n_embd;

    let headDim = textConfig.head_dim;
    if (!headDim && hiddenSize && numHeads) {
      headDim = Math.floor(hiddenSize / numHeads);
    }

    const maxPositionEmbeddings = textConfig.max_position_embeddings;
    const slidingWindow = textConfig.sliding_window || undefined;
    const slidingWindowPattern = textConfig.sliding_window_pattern || undefined;

    if (layers && kvHeads) {
      return {
        layers,
        kvHeads,
        headDim: headDim || 128,
        maxPositionEmbeddings,
        slidingWindow,
        slidingWindowPattern,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetch architecture info, falling back to a base model repo if needed.
 */
async function fetchModelArchitecture(
  modelId: string,
  baseModelId?: string,
): Promise<ModelArchitectureInfo | undefined> {
  let result = await tryFetchArchitectureFromRepo(modelId);
  if (!result && baseModelId) {
    result = await tryFetchArchitectureFromRepo(baseModelId);
  }
  return result;
}

// =============================================================================
// URL Inspection
// =============================================================================

/**
 * Inspect a URL and return normalized model metadata.
 * Dispatches to HuggingFace or OpenRouter inspectors.
 */
export async function inspectImportUrl(url: string): Promise<InspectUrlResult> {
  if (!isValidImportUrl(url)) {
    throw new ValidationError("Invalid URL format");
  }
  const urlType = getUrlType(url);
  if (!urlType) {
    throw new ValidationError(
      "Unsupported URL. Only HuggingFace and OpenRouter URLs are supported.",
    );
  }
  if (urlType === "huggingface") {
    return inspectHuggingFaceUrl(url);
  }
  return inspectOpenRouterUrl(url);
}

/**
 * Inspect a HuggingFace model URL.
 */
async function inspectHuggingFaceUrl(url: string): Promise<InspectUrlResult> {
  const match = url.match(/huggingface\.co\/([^/]+\/[^/?#]+)/);
  if (!match?.[1]) {
    throw new ValidationError("Invalid HuggingFace URL format");
  }
  const modelId = match[1];

  try {
    const response = await axios.get(
      `https://huggingface.co/api/models/${modelId}`,
      {
        headers: { "User-Agent": USER_AGENT },
        timeout: FETCH_TIMEOUT,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );

    // biome-ignore lint/suspicious/noExplicitAny: external API response
    const data = response.data as any;
    const baseModelId: string | undefined = data.cardData?.base_model;
    const isVisionModel = hasVisionSupport(data.tags, data.pipeline_tag);

    const ggufContextLength = data.gguf?.context_length;
    const fallbackMaxTokens = extractMaxTokens(data);
    let contextWindow = ggufContextLength || fallbackMaxTokens;

    let isGGUF = false;
    let quantizations: QuantizationInfo[] | undefined;
    let architecture: ModelArchitectureInfo | undefined;
    let visionSizeBytes: number | undefined;
    let hasVision = isVisionModel;

    // Check for GGUF files
    if (modelId.toLowerCase().includes("gguf") || data.tags?.includes("gguf")) {
      try {
        const filesResponse = await axios.get(
          `https://huggingface.co/api/models/${modelId}/tree/main`,
          {
            headers: { "User-Agent": USER_AGENT },
            timeout: FETCH_TIMEOUT,
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 300,
          },
        );

        // biome-ignore lint/suspicious/noExplicitAny: external API response
        const files = (filesResponse.data as any) || [];
        const ggufFiles = files.filter(
          // biome-ignore lint/suspicious/noExplicitAny: external API response
          (file: any) =>
            file.path?.endsWith(".gguf") && !file.path?.startsWith("mmproj-"),
        );

        if (ggufFiles.length > 0) {
          isGGUF = true;
          quantizations = ggufFiles
            // biome-ignore lint/suspicious/noExplicitAny: external API response
            .map((file: any) => ({
              id: extractQuantizationType(file.path),
              filename: file.path,
              sizeBytes: file.size,
            }))
            .sort(
              (a: QuantizationInfo, b: QuantizationInfo) =>
                a.sizeBytes - b.sizeBytes,
            );

          // Detect mmproj files
          const mmprojFiles = files.filter(
            // biome-ignore lint/suspicious/noExplicitAny: external API response
            (file: any) => file.path?.startsWith("mmproj-"),
          );
          if (mmprojFiles.length > 0) {
            const preferredMmproj =
              // biome-ignore lint/suspicious/noExplicitAny: external API response
              mmprojFiles.find((f: any) => f.path === "mmproj-F16.gguf") ||
              // biome-ignore lint/suspicious/noExplicitAny: external API response
              mmprojFiles.find((f: any) => f.path === "mmproj-BF16.gguf") ||
              mmprojFiles[0];
            if (preferredMmproj) {
              visionSizeBytes = preferredMmproj.size;
              hasVision = true;
            }
          }

          // Fetch architecture for VRAM estimation
          architecture = await fetchModelArchitecture(modelId, baseModelId);

          if (!contextWindow && architecture?.maxPositionEmbeddings) {
            contextWindow = architecture.maxPositionEmbeddings;
          }
        }
      } catch {
        logger.warn({ modelId }, "Could not fetch file list for GGUF model");
      }
    }

    const inputModalities: InputModality[] = ["text"];
    if (hasVision) inputModalities.push("image");

    // Use the first quantization as the default suggestion
    const defaultQuant = quantizations?.[0];
    const suggestedModelId = generateModelId(
      isGGUF ? "llama-cpp" : "openrouter",
      data.modelId || modelId,
      defaultQuant?.id,
    );

    return {
      sourceType: "huggingface",
      candidate: {
        suggestedModelId,
        name: data.modelId || modelId,
        providerModel: defaultQuant ? `${modelId}:${defaultQuant.id}` : modelId,
        capabilities: {
          modalities: { input: inputModalities, output: ["text"] },
          streaming: true,
          tools: true,
          jsonSchema: false,
          structuredOutputs: false,
          reasoning: { supported: false },
          contextWindow: contextWindow || 8192,
        },
        source: {
          url: `https://huggingface.co/${modelId}`,
          format: isGGUF ? "gguf" : undefined,
        },
        quantizations,
        architecture,
        visionSizeBytes,
      },
    };
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 404) {
        throw new ValidationError(
          `Model '${modelId}' not found on HuggingFace`,
        );
      }
      if (error.response?.status === 403) {
        throw new ValidationError(
          `Access denied to model '${modelId}'. It may be private or gated.`,
        );
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidationError(`Failed to fetch HuggingFace model: ${message}`);
  }
}

/**
 * Inspect an OpenRouter model URL.
 */
async function inspectOpenRouterUrl(url: string): Promise<InspectUrlResult> {
  const match = url.match(/openrouter\.ai\/(?:models\/)?([^/?#]+\/[^/?#]+)/);
  if (!match?.[1]) {
    throw new ValidationError("Invalid OpenRouter URL format");
  }
  const modelId = match[1];

  try {
    const response = await axios.get("https://openrouter.ai/api/v1/models", {
      headers: { "User-Agent": USER_AGENT },
      timeout: FETCH_TIMEOUT,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // biome-ignore lint/suspicious/noExplicitAny: external API response
    const models = (response.data as any).data;
    // biome-ignore lint/suspicious/noExplicitAny: external API response
    const model = models.find((m: any) => m.id === modelId);

    if (!model) {
      throw new ValidationError(`Model '${modelId}' not found on OpenRouter`);
    }

    const isVisionModel = hasVisionSupport([], undefined, model.architecture);
    const supportedParams: string[] = model.supported_parameters || [];
    const supportsTools = supportedParams.includes("tools");
    const supportsJsonSchema = supportedParams.includes("response_format");

    const inputModalities: InputModality[] = ["text"];
    if (isVisionModel) inputModalities.push("image");

    const suggestedModelId = generateModelId(
      "openrouter",
      model.name || modelId,
    );

    return {
      sourceType: "openrouter",
      candidate: {
        suggestedModelId,
        name: model.name || modelId,
        providerModel: modelId,
        capabilities: {
          modalities: { input: inputModalities, output: ["text"] },
          streaming: true,
          tools: supportsTools,
          jsonSchema: supportsJsonSchema,
          structuredOutputs: false,
          reasoning: { supported: false },
          contextWindow:
            typeof model.context_length === "number"
              ? model.context_length
              : 8192,
        },
        source: {
          url: `https://openrouter.ai/models/${modelId}`,
        },
      },
    };
  } catch (error: unknown) {
    if (error instanceof ValidationError) throw error;
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      throw new ValidationError(
        `OpenRouter API error or model '${modelId}' doesn't exist`,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidationError(`Failed to fetch OpenRouter model: ${message}`);
  }
}

// =============================================================================
// Provider Catalog Discovery
// =============================================================================

/**
 * Fetch available models from a provider that supports catalog discovery.
 * Currently supports OpenRouter and OpenAI response shapes.
 */
export async function fetchProviderCatalog(provider: {
  id: string;
  baseUrl: string | null;
  auth: unknown;
  headers?: unknown;
}): Promise<CatalogModel[]> {
  const baseUrl = provider.baseUrl
    ? interpolateEnvVars(provider.baseUrl, false)
    : null;
  if (!baseUrl) {
    throw new ValidationError(
      `Provider "${provider.id}" has no base URL configured`,
    );
  }

  const modelsUrl = `${baseUrl.replace(/\/+$/, "")}/models`;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };

  // Resolve auth headers
  const auth = provider.auth as {
    type: string;
    header?: string;
    value?: string;
  };
  if (auth?.type === "bearer" && auth.value) {
    headers.Authorization = `Bearer ${interpolateEnvVars(auth.value, false)}`;
  } else if (auth?.type === "header" && auth.header && auth.value) {
    headers[auth.header] = interpolateEnvVars(auth.value, false);
  }

  // Add custom headers from provider config
  const customHeaders = provider.headers as Record<string, string> | undefined;
  if (customHeaders) {
    for (const [key, value] of Object.entries(customHeaders)) {
      headers[key] = interpolateEnvVars(value, false);
    }
  }

  try {
    const response = await axios.get(modelsUrl, {
      headers,
      timeout: FETCH_TIMEOUT,
      validateStatus: (status) => status >= 200 && status < 300,
    });

    // biome-ignore lint/suspicious/noExplicitAny: external API response
    const data = response.data as any;
    // OpenAI-compatible APIs return { data: [...] }
    const models = Array.isArray(data) ? data : data.data || [];

    // biome-ignore lint/suspicious/noExplicitAny: external API response
    return models.map((m: any) => {
      const isOpenRouter =
        provider.id === "openrouter" || baseUrl.includes("openrouter.ai");

      // Detect capabilities
      const supportedParams: string[] = m.supported_parameters || [];
      const inputMods = m.architecture?.input_modalities || [];
      const inputModalities: string[] =
        inputMods.length > 0 ? inputMods : ["text"];

      const catalogModel: CatalogModel = {
        providerModel: m.id,
        name: m.name || m.id,
        contextWindow:
          typeof m.context_length === "number" ? m.context_length : undefined,
        inputModalities,
        tools: supportedParams.includes("tools") || undefined,
        jsonSchema: supportedParams.includes("response_format") || undefined,
        sourceUrl: isOpenRouter
          ? `https://openrouter.ai/models/${m.id}`
          : undefined,
      };

      return catalogModel;
    });
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new ValidationError(
          `Authentication failed for provider "${provider.id}". Check API key.`,
        );
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidationError(
      `Failed to fetch catalog from provider "${provider.id}": ${message}`,
    );
  }
}

// =============================================================================
// Import Normalization
// =============================================================================

/**
 * Convert an import entry into the ModelConfig shape expected by createModel().
 */
export function normalizeImportedModel(entry: ImportModelEntry): {
  id: string;
  config: ModelConfig;
} {
  return {
    id: entry.id,
    config: {
      name: entry.name,
      provider: entry.provider,
      providerModel: entry.providerModel,
      capabilities: entry.capabilities,
      source: {
        url: entry.source?.url || "",
        format: entry.source?.format,
        quantization: entry.source?.quantization,
        sizeBytes: entry.source?.sizeBytes,
        visionSizeBytes: entry.source?.visionSizeBytes,
        architecture: entry.source?.architecture
          ? {
              layers: entry.source.architecture.layers,
              kvHeads: entry.source.architecture.kvHeads,
              headDim: entry.source.architecture.headDim,
              slidingWindow: entry.source.architecture.slidingWindow,
              slidingWindowPattern:
                entry.source.architecture.slidingWindowPattern,
            }
          : undefined,
      },
      pricing: entry.pricing ?? null,
    },
  };
}
