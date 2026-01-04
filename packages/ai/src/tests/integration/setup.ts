/**
 * Integration Test Setup
 *
 * Helpers for running integration tests against real LLM providers.
 *
 * Environment variables:
 * - AI_TEST_PROVIDER: "openrouter" | "local" (required)
 * - OPENROUTER_API_KEY: API key for OpenRouter (required if provider=openrouter)
 * - OPENROUTER_MODEL: Model ID for OpenRouter (default: google/gemini-2.5-flash-lite-preview-09-2025)
 * - LOCAL_MODEL_URL: URL for local llama-server (default: http://localhost:11435)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { initAI, resetAI } from "../../index.js";
import type { AIMessage } from "../../types.js";
import type { ProvidersConfiguration, ModelsConfiguration, SelectionConfiguration } from "../../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================

export type IntegrationProvider = "openrouter" | "local";

export interface IntegrationConfig {
  provider: IntegrationProvider;
  apiKey?: string;
  modelId: string;
  baseUrl: string;
}

/**
 * Get the configured integration provider from environment
 */
export function getIntegrationProvider(): IntegrationProvider | null {
  const provider = process.env.AI_TEST_PROVIDER;
  if (provider === "openrouter" || provider === "local") {
    return provider;
  }
  return null;
}

/**
 * Check if integration tests should run
 */
export function canRunIntegration(): boolean {
  const provider = getIntegrationProvider();
  if (!provider) return false;

  if (provider === "openrouter") {
    return !!process.env.OPENROUTER_API_KEY;
  }

  return true; // Local doesn't require API key
}

/**
 * Get the full integration configuration
 */
export function getIntegrationConfig(): IntegrationConfig | null {
  const provider = getIntegrationProvider();
  if (!provider) return null;

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;

    return {
      provider: "openrouter",
      apiKey,
      modelId: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-lite-preview-09-2025",
      baseUrl: "https://openrouter.ai",
    };
  }

  // Local provider
  return {
    provider: "local",
    modelId: "local-llama",
    baseUrl: process.env.LOCAL_MODEL_URL || "http://localhost:11435",
  };
}

/**
 * Skip test suite if integration tests are not configured
 */
export function skipIfNoIntegration(): void {
  const config = getIntegrationConfig();
  if (!config) {
    const provider = getIntegrationProvider();
    if (!provider) {
      throw new Error("AI_TEST_PROVIDER not set. Set to 'openrouter' or 'local'.");
    }
    if (provider === "openrouter") {
      throw new Error("OPENROUTER_API_KEY not set for OpenRouter integration tests.");
    }
    throw new Error("Integration test configuration incomplete.");
  }
}

// =============================================================================
// DYNAMIC FIXTURE GENERATION
// =============================================================================

let tempConfigDir: string | null = null;

/**
 * Create temporary config directory with provider-specific configuration
 */
export function createIntegrationConfigDir(): string {
  const config = getIntegrationConfig();
  if (!config) {
    throw new Error("Cannot create config dir: integration not configured");
  }

  // Create temp directory
  tempConfigDir = fs.mkdtempSync(path.join("/tmp", "ai-integration-test-"));

  // Generate provider config
  let providers: ProvidersConfiguration;
  let models: ModelsConfiguration;
  const selection: SelectionConfiguration = {
    active: {
      backend: config.provider === "openrouter" ? "openrouter-default" : "local-llama",
      workers: config.provider === "openrouter" ? "openrouter-default" : "local-llama",
    },
  };

  if (config.provider === "openrouter") {
    providers = {
      providers: {
        openrouter: {
          dialect: "openai_compatible",
          baseUrl: "https://openrouter.ai/api/v1",
          headers: {
            "HTTP-Referer": "https://eclaire.dev",
            "X-Title": "Eclaire AI Integration Tests",
          },
          auth: {
            type: "bearer",
            header: "Authorization",
            value: `Bearer ${config.apiKey!}`,
          },
        },
      },
    };

    models = {
      models: {
        "openrouter-default": {
          provider: "openrouter",
          name: "OpenRouter Integration Model",
          providerModel: config.modelId,
          capabilities: {
            contextWindow: 32768,
            maxOutputTokens: 8192,
            streaming: true,
            tools: true,
            jsonSchema: true,
            structuredOutputs: true,
            reasoning: { supported: false },
            modalities: {
              input: ["text"],
              output: ["text"],
            },
          },
          tokenizer: {
            type: "tiktoken",
            name: "cl100k_base",
          },
          source: {
            url: "https://openrouter.ai",
          },
        },
      },
    };
  } else {
    // Local provider
    providers = {
      providers: {
        "local-llama": {
          dialect: "openai_compatible",
          baseUrl: `${config.baseUrl}/v1`,
          auth: {
            type: "none",
          },
        },
      },
    };

    models = {
      models: {
        "local-llama": {
          provider: "local-llama",
          name: "Local Llama Model",
          providerModel: "local-model",
          capabilities: {
            contextWindow: 8192,
            maxOutputTokens: 4096,
            streaming: true,
            tools: true,
            jsonSchema: false,
            structuredOutputs: false,
            reasoning: { supported: false },
            modalities: {
              input: ["text"],
              output: ["text"],
            },
          },
          tokenizer: {
            type: "tiktoken",
            name: "cl100k_base",
          },
          source: {
            url: "http://localhost:11435",
          },
        },
      },
    };
  }

  // Write config files
  fs.writeFileSync(
    path.join(tempConfigDir, "providers.json"),
    JSON.stringify(providers, null, 2)
  );
  fs.writeFileSync(
    path.join(tempConfigDir, "models.json"),
    JSON.stringify(models, null, 2)
  );
  fs.writeFileSync(
    path.join(tempConfigDir, "selection.json"),
    JSON.stringify(selection, null, 2)
  );

  return tempConfigDir;
}

/**
 * Clean up temporary config directory
 */
export function cleanupIntegrationConfigDir(): void {
  if (tempConfigDir) {
    try {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    tempConfigDir = null;
  }
}

// =============================================================================
// TEST INITIALIZATION HELPERS
// =============================================================================

/**
 * Create a mock logger factory for integration tests
 */
export function createIntegrationLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: console.warn,
    error: console.error,
    trace: () => {},
    fatal: console.error,
    child: () => createIntegrationLogger(),
  };
}

/**
 * Initialize AI client for integration tests
 */
export function initIntegrationAI(): void {
  const configPath = createIntegrationConfigDir();
  initAI({
    configPath,
    createChildLogger: () => createIntegrationLogger(),
  });
}

/**
 * Reset AI client and clean up after integration tests
 */
export function resetIntegrationAI(): void {
  resetAI();
  cleanupIntegrationConfigDir();
}

// =============================================================================
// TEST PROMPTS
// =============================================================================

/**
 * Create a minimal prompt for basic testing (minimal tokens)
 */
export function createMinimalPrompt(): AIMessage[] {
  return [{ role: "user", content: "Reply with exactly one word: OK" }];
}

/**
 * Create a prompt that should trigger tool use
 */
export function createToolTriggerPrompt(): AIMessage[] {
  return [
    {
      role: "system",
      content: "You are a helpful assistant. When asked to perform a calculation, use the calculator tool.",
    },
    {
      role: "user",
      content: "What is 42 + 17? Use the calculator tool to compute this.",
    },
  ];
}

/**
 * Create a simple tool definition for testing
 */
export function createCalculatorTool() {
  return {
    type: "function" as const,
    function: {
      name: "calculator",
      description: "Perform basic arithmetic calculations",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["add", "subtract", "multiply", "divide"],
            description: "The operation to perform",
          },
          a: {
            type: "number",
            description: "First operand",
          },
          b: {
            type: "number",
            description: "Second operand",
          },
        },
        required: ["operation", "a", "b"],
      },
    },
  };
}

/**
 * Execute a calculator tool call
 */
export function executeCalculator(args: { operation: string; a: number; b: number }): string {
  const { operation, a, b } = args;
  let result: number;
  switch (operation) {
    case "add":
      result = a + b;
      break;
    case "subtract":
      result = a - b;
      break;
    case "multiply":
      result = a * b;
      break;
    case "divide":
      result = a / b;
      break;
    default:
      return `Unknown operation: ${operation}`;
  }
  return `${result}`;
}

// =============================================================================
// STREAM HELPERS
// =============================================================================

/**
 * Collect all chunks from a stream
 */
export async function collectStream(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode(); // Flush remaining
  } finally {
    reader.releaseLock();
  }

  return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { path, fs };
