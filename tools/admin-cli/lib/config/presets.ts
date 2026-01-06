/**
 * Provider preset definitions
 *
 * Common provider configurations that can be used to quickly set up providers.
 */

import type { ProviderPreset } from "../types/index.js";

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "llama-cpp",
    name: "llama.cpp",
    description: "Local llama.cpp server with OpenAI-compatible API (managed)",
    isCloud: false,
    defaultPort: 11500,
    defaultEngine: {
      name: "llama-cpp",
      gpuLayers: -1,
    },
    config: {
      dialect: "openai_compatible",
      baseUrl: "http://127.0.0.1:11500/v1",
      auth: { type: "none", requiresApiKey: false },
    },
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Ollama local model server (external)",
    isCloud: false,
    defaultPort: 11434,
    defaultEngine: {
      name: "ollama",
    },
    config: {
      dialect: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      auth: { type: "none", requiresApiKey: false },
    },
  },
  {
    id: "lm-studio",
    name: "LM Studio",
    description: "LM Studio local server (external)",
    isCloud: false,
    defaultPort: 1234,
    defaultEngine: {
      name: "lm-studio",
    },
    config: {
      dialect: "openai_compatible",
      baseUrl: "http://127.0.0.1:1234/v1",
      auth: { type: "none", requiresApiKey: false },
    },
  },
  {
    id: "mlx-lm",
    name: "mlx-lm",
    description: "MLX-LM for Apple Silicon (text models)",
    isCloud: false,
    defaultPort: 11434,
    defaultEngine: {
      name: "mlx-lm",
    },
    config: {
      dialect: "openai_compatible",
      baseUrl: "http://127.0.0.1:11434/v1",
      auth: { type: "none", requiresApiKey: false },
    },
  },
  {
    id: "mlx-vlm",
    name: "mlx-vlm",
    description: "MLX-VLM for Apple Silicon (vision models)",
    isCloud: false,
    defaultPort: 11434,
    defaultEngine: {
      name: "mlx-vlm",
    },
    config: {
      dialect: "mlx_native",
      baseUrl: "http://127.0.0.1:11434",
      auth: { type: "none", requiresApiKey: false },
    },
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "OpenRouter cloud API (requires API key)",
    isCloud: true,
    config: {
      dialect: "openai_compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer": "${ENV:OPENROUTER_HTTP_REFERER}",
        "X-Title": "${ENV:OPENROUTER_X_TITLE}",
      },
      auth: {
        type: "bearer",
        requiresApiKey: true,
        envVar: "OPENROUTER_API_KEY",
      },
    },
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "OpenAI API (requires API key)",
    isCloud: true,
    config: {
      dialect: "openai_compatible",
      baseUrl: "https://api.openai.com/v1",
      auth: { type: "bearer", requiresApiKey: true, envVar: "OPENAI_API_KEY" },
    },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Anthropic Claude API (requires API key)",
    isCloud: true,
    config: {
      dialect: "anthropic_messages",
      baseUrl: "https://api.anthropic.com",
      headers: {
        "anthropic-version": "2023-06-01",
      },
      auth: {
        type: "header",
        requiresApiKey: true,
        envVar: "ANTHROPIC_API_KEY",
      },
    },
  },
  {
    id: "custom",
    name: "Custom",
    description: "Manually configure all provider settings",
    isCloud: false,
    defaultPort: 8080,
    config: {
      dialect: "openai_compatible",
      baseUrl: "http://127.0.0.1:8080/v1",
      auth: { type: "none", requiresApiKey: false },
    },
  },
];

/**
 * Get a preset by ID
 */
export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/**
 * Get all preset IDs
 */
export function getPresetIds(): string[] {
  return PROVIDER_PRESETS.map((p) => p.id);
}

/**
 * Get presets sorted with recommended first
 */
export function getPresetsForSelection(): ProviderPreset[] {
  // Put common choices first: llama-cpp, ollama, openrouter, then others
  const priority = [
    "llama-cpp",
    "ollama",
    "openrouter",
    "lm-studio",
    "mlx-lm",
    "mlx-vlm",
  ];
  const sorted = [...PROVIDER_PRESETS].sort((a, b) => {
    const aIdx = priority.indexOf(a.id);
    const bIdx = priority.indexOf(b.id);
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
  // Always put custom last
  const customIdx = sorted.findIndex((p) => p.id === "custom");
  if (customIdx !== -1) {
    const [custom] = sorted.splice(customIdx, 1);
    sorted.push(custom!);
  }
  return sorted;
}
