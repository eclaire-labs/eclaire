/**
 * Model refresh command
 *
 * Re-fetches model metadata from HuggingFace for existing GGUF models.
 */

import axios from "axios";
import inquirer from "inquirer";
import ora from "ora";
import { getModels, updateModel } from "../../config/models.js";
import { colors, icons } from "../../ui/colors.js";

interface ArchitectureInfo {
  layers: number;
  kvHeads: number;
  headDim?: number;
  maxPositionEmbeddings?: number;
  slidingWindow?: number;
  slidingWindowPattern?: number;
}

interface VisionInfo {
  visionSizeBytes: number;
}

/**
 * Try to fetch architecture info from a single HuggingFace model's config.json
 */
async function tryFetchArchitectureFromRepo(
  modelId: string,
): Promise<ArchitectureInfo | undefined> {
  try {
    const response = await axios.get(
      `https://huggingface.co/${modelId}/raw/main/config.json`,
      {
        headers: { "User-Agent": "eclaire-cli/1.0.0" },
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );

    // biome-ignore lint/suspicious/noExplicitAny: external API response — shape varies by provider
    const config = response.data as any;

    // For multimodal models, check text_config first (e.g., Gemma 3 vision models)
    const textConfig = config.text_config || config;

    // Extract architecture info - different models use different field names
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

    // Calculate head_dim if not directly available
    let headDim = textConfig.head_dim;
    if (!headDim && hiddenSize && numHeads) {
      headDim = Math.floor(hiddenSize / numHeads);
    }

    // Extract context length and sliding window info
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
 * Fetch base model ID from HuggingFace API (for GGUF repos that are re-quantizations)
 */
async function fetchBaseModelId(modelId: string): Promise<string | undefined> {
  try {
    const response = await axios.get(
      `https://huggingface.co/api/models/${modelId}`,
      {
        headers: { "User-Agent": "eclaire-cli/1.0.0" },
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );
    return response.data?.cardData?.base_model;
  } catch {
    return undefined;
  }
}

/**
 * Fetch architecture info from HuggingFace config.json
 * Falls back to base model if GGUF repo doesn't have config.json
 */
async function fetchArchitecture(
  modelId: string,
  baseModelId?: string,
): Promise<ArchitectureInfo | undefined> {
  // Try the GGUF repo first
  let result = await tryFetchArchitectureFromRepo(modelId);

  // If failed and base model available, try that
  if (!result && baseModelId) {
    result = await tryFetchArchitectureFromRepo(baseModelId);
  }

  return result;
}

/**
 * Fetch vision projector (mmproj) file size from HuggingFace
 * Prefers F16, then BF16, then any available mmproj file
 */
async function fetchVisionInfo(
  modelId: string,
): Promise<VisionInfo | undefined> {
  try {
    const response = await axios.get(
      `https://huggingface.co/api/models/${modelId}/tree/main`,
      {
        headers: { "User-Agent": "eclaire-cli/1.0.0" },
        timeout: 10000,
        validateStatus: (status) => status >= 200 && status < 300,
      },
    );

    // biome-ignore lint/suspicious/noExplicitAny: HuggingFace API file listing — untyped response
    const files = (response.data as any) || [];
    // biome-ignore lint/suspicious/noExplicitAny: HuggingFace API file listing — untyped response
    const mmprojFiles = files.filter((file: any) =>
      file.path?.startsWith("mmproj-"),
    );

    if (mmprojFiles.length === 0) {
      return undefined;
    }

    // Prefer F16 as it's what llama-server uses by default
    const preferredMmproj =
      // biome-ignore lint/suspicious/noExplicitAny: HuggingFace API file listing — untyped response
      mmprojFiles.find((f: any) => f.path === "mmproj-F16.gguf") ||
      // biome-ignore lint/suspicious/noExplicitAny: HuggingFace API file listing — untyped response
      mmprojFiles.find((f: any) => f.path === "mmproj-BF16.gguf") ||
      mmprojFiles[0];

    if (preferredMmproj?.size) {
      return { visionSizeBytes: preferredMmproj.size };
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract HuggingFace model ID from source URL
 */
function extractHFModelId(sourceUrl: string): string | undefined {
  const match = sourceUrl.match(/huggingface\.co\/([^/]+\/[^/?#]+)/);
  return match?.[1];
}

export async function refreshCommand(modelId?: string): Promise<void> {
  try {
    // Get models to refresh
    const allModels = getModels();
    const ggufModels = allModels.filter(
      (m) =>
        m.model.source?.format === "gguf" &&
        m.model.source?.url?.includes("huggingface.co"),
    );

    if (ggufModels.length === 0) {
      console.log(
        colors.warning(
          `${icons.warning} No GGUF models from HuggingFace found`,
        ),
      );
      return;
    }

    // Filter to specific model if provided
    let modelsToRefresh = ggufModels;
    if (modelId) {
      modelsToRefresh = ggufModels.filter((m) => m.id === modelId);
      if (modelsToRefresh.length === 0) {
        console.log(
          colors.error(
            `${icons.error} Model '${modelId}' not found or is not a GGUF model from HuggingFace`,
          ),
        );
        process.exit(1);
      }
    }

    // Check if any models already have architecture data
    const modelsWithArch = modelsToRefresh.filter(
      (m) => m.model.source.architecture,
    );
    if (modelsWithArch.length > 0) {
      console.log(
        colors.dim(
          `\n${modelsWithArch.length} model(s) already have architecture data.`,
        ),
      );
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Re-fetch and overwrite existing data?",
          default: true,
        },
      ]);
      if (!confirm) {
        console.log(colors.dim("Cancelled."));
        return;
      }
    }

    console.log(
      colors.header(`\n${icons.gear} Refreshing Model Architecture Info\n`),
    );
    console.log(
      colors.dim(`Found ${modelsToRefresh.length} GGUF model(s) to refresh\n`),
    );

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const { id, model } of modelsToRefresh) {
      const spinner = ora({
        text: `Refreshing ${id}...`,
        color: "cyan",
      }).start();

      try {
        const hfModelId = extractHFModelId(model.source.url);
        if (!hfModelId) {
          spinner.warn(`${id}: Could not extract HuggingFace model ID`);
          skipped++;
          continue;
        }

        // Fetch base model ID for GGUF repos that are re-quantizations
        const baseModelId = await fetchBaseModelId(hfModelId);

        // Fetch architecture (falls back to base model if GGUF repo doesn't have config.json)
        const architecture = await fetchArchitecture(hfModelId, baseModelId);
        if (!architecture) {
          spinner.warn(`${id}: Could not fetch architecture from config.json`);
          failed++;
          continue;
        }

        // Build the architecture for storage (including SWA info)
        const archForStorage = {
          layers: architecture.layers,
          kvHeads: architecture.kvHeads,
          headDim: architecture.headDim,
          ...(architecture.slidingWindow && {
            slidingWindow: architecture.slidingWindow,
          }),
          ...(architecture.slidingWindowPattern && {
            slidingWindowPattern: architecture.slidingWindowPattern,
          }),
        };

        // Fetch vision info (mmproj file size) for vision models
        const isVisionModel =
          model.capabilities?.modalities?.input?.includes("image");
        const visionInfo = isVisionModel
          ? await fetchVisionInfo(hfModelId)
          : undefined;

        // Update the model
        const updatedModel = {
          ...model,
          source: {
            ...model.source,
            architecture: archForStorage,
            ...(visionInfo && { visionSizeBytes: visionInfo.visionSizeBytes }),
          },
        };

        // Also update contextWindow if we got it and current seems missing/wrong
        const currentContext = model.capabilities?.contextWindow;
        const needsContextUpdate =
          architecture.maxPositionEmbeddings &&
          (!currentContext || currentContext === 8192);

        if (needsContextUpdate) {
          updatedModel.capabilities = {
            ...model.capabilities,
            // biome-ignore lint/style/noNonNullAssertion: checked via needsContextUpdate guard above
            contextWindow: architecture.maxPositionEmbeddings!,
          };
        }

        updateModel(id, updatedModel);

        // Build success message
        let successMsg = `${id}: Updated (${architecture.layers} layers, ${architecture.kvHeads} KV heads`;
        if (architecture.slidingWindow) {
          successMsg += `, SWA=${architecture.slidingWindow}`;
        }
        successMsg += ")";
        if (needsContextUpdate) {
          successMsg += ` + context: ${architecture.maxPositionEmbeddings?.toLocaleString()}`;
        }
        if (visionInfo) {
          const visionMB = Math.round(
            visionInfo.visionSizeBytes / (1024 * 1024),
          );
          successMsg += ` + vision: ${visionMB} MB`;
        }
        spinner.succeed(successMsg);
        updated++;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        spinner.fail(`${id}: ${message}`);
        failed++;
      }
    }

    // Summary
    console.log("");
    console.log(colors.subheader("Summary:"));
    if (updated > 0) {
      console.log(colors.success(`  ${icons.success} Updated: ${updated}`));
    }
    if (skipped > 0) {
      console.log(colors.dim(`  ${icons.info} Skipped: ${skipped}`));
    }
    if (failed > 0) {
      console.log(colors.warning(`  ${icons.warning} Failed: ${failed}`));
    }

    if (updated > 0) {
      console.log("");
      console.log(colors.dim("Model metadata has been updated."));
      console.log(
        colors.dim("Run `eclaire model list` to see updated estimates."),
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(colors.error(`${icons.error} Refresh failed: ${message}`));
    process.exit(1);
  }
}
