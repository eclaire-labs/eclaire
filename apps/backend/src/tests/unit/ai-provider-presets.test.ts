import { describe, expect, it } from "vitest";
import {
  getProviderPresetById,
  listProviderPresets,
} from "../../lib/services/ai-provider-presets.js";

describe("listProviderPresets", () => {
  const presets = listProviderPresets();

  it("returns all 9 presets", () => {
    expect(presets).toHaveLength(9);
  });

  it("all presets have required fields", () => {
    for (const preset of presets) {
      expect(preset.id).toBeTruthy();
      expect(preset.name).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(typeof preset.isCloud).toBe("boolean");
      expect(typeof preset.supportsCatalogDiscovery).toBe("boolean");
      expect(preset.config).toBeDefined();
      expect(preset.config.dialect).toBeTruthy();
      expect(preset.config.baseUrl).toBeTruthy();
      expect(preset.config.auth).toBeDefined();
      expect(preset.config.auth.type).toBeTruthy();
      expect(typeof preset.config.auth.requiresApiKey).toBe("boolean");
    }
  });

  it("preset IDs are unique", () => {
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("openrouter and openai support catalog discovery", () => {
    const openrouter = presets.find((p) => p.id === "openrouter");
    const openai = presets.find((p) => p.id === "openai");
    expect(openrouter?.supportsCatalogDiscovery).toBe(true);
    expect(openai?.supportsCatalogDiscovery).toBe(true);
  });

  it("local providers do not support catalog discovery", () => {
    const localIds = ["llama-cpp", "ollama", "lm-studio", "mlx-lm", "mlx-vlm"];
    for (const id of localIds) {
      const preset = presets.find((p) => p.id === id);
      expect(preset?.supportsCatalogDiscovery).toBe(false);
    }
  });

  it("cloud providers require API keys", () => {
    const cloudIds = ["openrouter", "openai", "anthropic"];
    for (const id of cloudIds) {
      const preset = presets.find((p) => p.id === id);
      expect(preset?.isCloud).toBe(true);
      expect(preset?.config.auth.requiresApiKey).toBe(true);
    }
  });
});

describe("getProviderPresetById", () => {
  it("returns preset for known ID", () => {
    const preset = getProviderPresetById("openrouter");
    expect(preset).toBeDefined();
    expect(preset?.name).toBe("OpenRouter");
  });

  it("returns undefined for unknown ID", () => {
    expect(getProviderPresetById("nonexistent")).toBeUndefined();
  });
});
