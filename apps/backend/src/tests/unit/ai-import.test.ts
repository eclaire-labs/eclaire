import { describe, expect, it } from "vitest";
import {
  extractMaxTokens,
  extractQuantizationType,
  formatFileSize,
  generateModelId,
  getUrlType,
  hasVisionSupport,
  isValidImportUrl,
  normalizeImportedModel,
} from "../../lib/services/ai-import.js";

describe("getUrlType", () => {
  it("detects huggingface URLs", () => {
    expect(getUrlType("https://huggingface.co/unsloth/Qwen3-14B-GGUF")).toBe(
      "huggingface",
    );
  });

  it("detects openrouter URLs", () => {
    expect(
      getUrlType("https://openrouter.ai/models/anthropic/claude-3.5-sonnet"),
    ).toBe("openrouter");
  });

  it("returns null for unsupported URLs", () => {
    expect(getUrlType("https://example.com/model")).toBeNull();
  });
});

describe("isValidImportUrl", () => {
  it("accepts valid URLs", () => {
    expect(isValidImportUrl("https://huggingface.co/foo/bar")).toBe(true);
  });

  it("rejects invalid strings", () => {
    expect(isValidImportUrl("not-a-url")).toBe(false);
  });
});

describe("hasVisionSupport", () => {
  it("detects from image-text-to-text tag", () => {
    expect(hasVisionSupport(["image-text-to-text"])).toBe(true);
  });

  it("detects from pipeline_tag", () => {
    expect(hasVisionSupport([], "image-text-to-text")).toBe(true);
  });

  it("detects from architecture input_modalities", () => {
    expect(
      hasVisionSupport([], undefined, {
        input_modalities: ["text", "image"],
      }),
    ).toBe(true);
  });

  it("returns false with no vision signals", () => {
    expect(hasVisionSupport(["text-generation"])).toBe(false);
  });
});

describe("extractQuantizationType", () => {
  it("extracts Q4_K_XL", () => {
    expect(extractQuantizationType("Model-Q4_K_XL.gguf")).toBe("Q4_K_XL");
  });

  it("extracts Q8_0", () => {
    expect(extractQuantizationType("Model-Q8_0.gguf")).toBe("Q8_0");
  });

  it("extracts F16", () => {
    expect(extractQuantizationType("Model-F16.gguf")).toBe("F16");
  });

  it("extracts IQ quantizations", () => {
    expect(extractQuantizationType("Model-IQ4_XS.gguf")).toBe("IQ4_XS");
  });

  it("returns UNKNOWN for unrecognized patterns", () => {
    expect(extractQuantizationType("model.gguf")).toBe("UNKNOWN");
  });
});

describe("extractMaxTokens", () => {
  it("extracts from cardData", () => {
    expect(
      extractMaxTokens({ cardData: { max_position_embeddings: 32768 } }),
    ).toBe(32768);
  });

  it("extracts from config", () => {
    expect(
      extractMaxTokens({ config: { max_position_embeddings: 131072 } }),
    ).toBe(131072);
  });

  it("returns undefined when not found", () => {
    expect(extractMaxTokens({})).toBeUndefined();
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats gigabytes", () => {
    expect(formatFileSize(5 * 1024 ** 3)).toBe("5.0 GB");
  });

  it("returns Unknown for 0", () => {
    expect(formatFileSize(0)).toBe("Unknown");
  });
});

describe("generateModelId", () => {
  it("generates provider:model format", () => {
    expect(generateModelId("openrouter", "Claude 3.5 Sonnet")).toBe(
      "openrouter:claude-3-5-sonnet",
    );
  });

  it("strips path prefix from model name", () => {
    expect(generateModelId("openrouter", "anthropic/claude-3.5-sonnet")).toBe(
      "openrouter:claude-3-5-sonnet",
    );
  });

  it("appends quantization", () => {
    expect(generateModelId("llama-cpp", "Qwen3-14B", "Q4_K_XL")).toBe(
      "llama-cpp:qwen3-14b-q4-k-xl",
    );
  });
});

describe("normalizeImportedModel", () => {
  it("converts import entry to model config", () => {
    const result = normalizeImportedModel({
      id: "openrouter:test-model",
      name: "Test Model",
      provider: "openrouter",
      providerModel: "provider/test-model",
      capabilities: {
        modalities: { input: ["text"], output: ["text"] },
        streaming: true,
        tools: true,
        jsonSchema: false,
        structuredOutputs: false,
        reasoning: { supported: false },
        contextWindow: 32768,
      },
      source: { url: "https://example.com" },
    });

    expect(result.id).toBe("openrouter:test-model");
    expect(result.config.name).toBe("Test Model");
    expect(result.config.provider).toBe("openrouter");
    expect(result.config.providerModel).toBe("provider/test-model");
    expect(result.config.capabilities.contextWindow).toBe(32768);
    expect(result.config.source.url).toBe("https://example.com");
    expect(result.config.pricing).toBeNull();
  });
});
