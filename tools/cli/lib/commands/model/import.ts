import ora from "ora";
import {
  importModelsViaApi,
  inspectModelUrl,
  type InspectUrlCandidate,
} from "../../backend-client.js";
import {
  getProviders,
  isModelSuitableForBackend,
  isModelSuitableForWorkers,
} from "../../config/models.js";
import { closeDb } from "../../db/index.js";
import { estimateModelMemory, formatMemorySize } from "../../engine/memory.js";
import type { CommandOptions, InputModality } from "../../types/index.js";
import {
  cancel,
  confirm,
  intro,
  isCancelled,
  outro,
  selectOne,
  textInput,
} from "../../ui/clack.js";
import { colors, icons, printProviderReminder } from "../../ui/colors.js";
import { promptProviderSelection } from "../../ui/prompts.js";

function formatFileSize(bytes: number): string {
  if (!bytes) return "Unknown";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

export async function importCommand(
  url: string,
  options: CommandOptions,
): Promise<void> {
  try {
    // Validate URL format
    try {
      new URL(url);
    } catch {
      console.log(colors.error(`${icons.error} Invalid URL format`));
      process.exit(1);
    }

    // Detect source type from URL
    let sourceType: string | null = null;
    if (url.includes("huggingface.co")) sourceType = "huggingface";
    else if (url.includes("openrouter.ai")) sourceType = "openrouter";

    if (!sourceType) {
      console.log(
        colors.error(
          `${icons.error} Unsupported URL. Only HuggingFace and OpenRouter URLs are supported`,
        ),
      );
      console.log(colors.dim("Examples:"));
      console.log(
        colors.dim("  https://huggingface.co/microsoft/DialoGPT-medium"),
      );
      console.log(
        colors.dim(
          "  https://openrouter.ai/models/anthropic/claude-3.5-sonnet",
        ),
      );
      process.exit(1);
    }

    intro(`Import Model from ${sourceType}`);
    console.log(colors.dim(`URL: ${url}`));

    // Step 1: Inspect URL via backend API
    const spinner = ora("Fetching model information...").start();
    let candidate: InspectUrlCandidate;
    let inspectedSourceType: string;

    try {
      const result = await inspectModelUrl(url);
      candidate = result.candidate;
      inspectedSourceType = result.sourceType;
      spinner.succeed("Model information retrieved");
    } catch (error: unknown) {
      spinner.fail("Failed to fetch model information");
      const message = error instanceof Error ? error.message : String(error);
      console.log(colors.error(`${icons.error} ${message}`));
      process.exit(1);
    }

    // Step 2: Display model information
    const hasVision =
      candidate.capabilities.modalities?.input?.includes("image") ?? false;
    console.log(colors.subheader("\nModel Information:"));
    console.log(`Name: ${candidate.name}`);
    console.log(`API Model ID: ${candidate.providerModel}`);
    console.log(`Vision: ${hasVision ? "Detected" : "Not Detected"}`);
    if (candidate.capabilities.contextWindow) {
      console.log(
        `Context Window: ${candidate.capabilities.contextWindow.toLocaleString()} tokens`,
      );
    }

    // Step 3: Show quantization options for GGUF models
    let selectedQuantId: string | undefined;
    let selectedQuantSize: number | undefined;

    if (candidate.quantizations && candidate.quantizations.length > 0) {
      console.log(colors.subheader("\nAvailable Quantizations:"));
      console.log(
        colors.dim("These are the different compressed versions available:"),
      );

      const arch = candidate.architecture;
      const canEstimateMemory =
        arch?.layers && arch?.kvHeads && candidate.capabilities.contextWindow;

      const Table = (await import("cli-table3")).default;
      const headers = [
        colors.header("Quantization"),
        colors.header("File Size"),
      ];
      const colWidths = [15, 13];

      if (canEstimateMemory) {
        headers.push(colors.header("Est. Memory"));
        colWidths.push(14);
      }
      headers.push(colors.header("Filename"));
      colWidths.push(canEstimateMemory ? 30 : 35);

      const quantTable = new Table({
        head: headers,
        colWidths,
        style: { head: [], border: ["gray"] },
      });

      const getMemoryEstimate = (size: number): string => {
        if (!canEstimateMemory || !arch) return "-";
        const estimate = estimateModelMemory(
          size,
          // biome-ignore lint/style/noNonNullAssertion: checked via canEstimateMemory guard
          candidate.capabilities.contextWindow!,
          {
            // biome-ignore lint/style/noNonNullAssertion: checked via canEstimateMemory guard
            layers: arch.layers!,
            // biome-ignore lint/style/noNonNullAssertion: checked via canEstimateMemory guard
            kvHeads: arch.kvHeads!,
            headDim: arch.headDim,
            slidingWindow: arch.slidingWindow,
            slidingWindowPattern: arch.slidingWindowPattern,
          },
          candidate.visionSizeBytes,
        );
        return `~${formatMemorySize(estimate.total)}`;
      };

      candidate.quantizations.slice(0, 10).forEach((q) => {
        const row = [colors.emphasis(q.id), formatFileSize(q.sizeBytes)];
        if (canEstimateMemory) {
          row.push(getMemoryEstimate(q.sizeBytes));
        }
        row.push(colors.dim(q.filename));
        quantTable.push(row);
      });

      console.log(quantTable.toString());
      if (candidate.quantizations.length > 10) {
        console.log(
          colors.dim(
            `... and ${candidate.quantizations.length - 10} more quantizations`,
          ),
        );
      }
      if (canEstimateMemory) {
        console.log(
          colors.dim(
            `Memory estimates at ${candidate.capabilities.contextWindow?.toLocaleString()} context`,
          ),
        );
      }

      // Prompt user to select quantization
      const selectedQuantIndex = await selectOne<string>({
        message: "Select quantization (affects model size and quality):",
        options: candidate.quantizations.map((q, index) => {
          const memInfo = canEstimateMemory
            ? ` | ${getMemoryEstimate(q.sizeBytes)}`
            : "";
          return {
            value: String(index),
            label: `${q.id} (${formatFileSize(q.sizeBytes)}${memInfo})`,
            hint: q.filename,
          };
        }),
      });

      const quant =
        candidate.quantizations[Number.parseInt(selectedQuantIndex, 10)];
      if (quant) {
        selectedQuantId = quant.id;
        selectedQuantSize = quant.sizeBytes;
      }
    }

    // Step 4: Provider selection
    const providers = getProviders();
    const providerIds = Object.keys(providers);

    if (providerIds.length === 0) {
      console.log(colors.error(`${icons.error} No providers configured`));
      console.log(
        colors.dim("Add at least one provider before importing models"),
      );
      console.log(colors.dim("Run: eclaire provider add"));
      process.exit(1);
    }

    let selectedProvider: string;
    if (options.provider && providerIds.includes(options.provider)) {
      selectedProvider = options.provider;
    } else {
      let suggestedProviders: string[];
      if (inspectedSourceType === "openrouter") {
        suggestedProviders = providerIds.filter(
          (p) => p === "openrouter" || p === "proxy",
        );
      } else if (candidate.source.format === "gguf") {
        suggestedProviders = providerIds.filter(
          (p) =>
            p === "llamacpp" ||
            p === "llama-cpp" ||
            p === "ollama" ||
            p === "lm-studio" ||
            p.includes("mlx"),
        );
      } else {
        suggestedProviders = providerIds;
      }

      const orderedProviders = [
        ...suggestedProviders,
        ...providerIds.filter((p) => !suggestedProviders.includes(p)),
      ];

      selectedProvider = await promptProviderSelection(
        orderedProviders,
        "Select provider for this model:",
      );

      if (selectedProvider === "mlx-lm" && hasVision) {
        console.log(
          colors.warning(
            `\n${icons.warning} Warning: mlx-lm only supports text models.`,
          ),
        );
        console.log(
          colors.dim("For vision support, consider using mlx-vlm instead."),
        );
        const continueWithMlx = await confirm({
          message: "Continue with mlx-lm anyway?",
          initialValue: false,
        });
        if (!continueWithMlx) {
          cancel("Import cancelled");
          process.exit(0);
        }
      }
    }

    // Step 5: Generate and confirm model ID
    let modelId = candidate.suggestedModelId;
    // Adjust model ID for selected provider and quantization
    const namePart = (candidate.name.split("/").pop() ?? candidate.name)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (selectedQuantId) {
      const normalizedQuant = selectedQuantId.toLowerCase().replace(/_/g, "-");
      modelId = `${selectedProvider}:${namePart}-${normalizedQuant}`;
    } else {
      modelId = `${selectedProvider}:${namePart}`;
    }

    if (options.interactive !== false) {
      modelId = await textInput({
        message: "Model ID (unique identifier):",
        defaultValue: modelId,
        validate: (input: string) => {
          if (input.trim().length === 0) return "Model ID is required";
          return undefined;
        },
      });
    }

    // Step 6: Build the import payload
    const inputModalities: InputModality[] = ["text"];
    if (hasVision) inputModalities.push("image");

    const providerModel = selectedQuantId
      ? `${candidate.providerModel.split(":")[0]}:${selectedQuantId}`
      : candidate.providerModel;

    const modelName = selectedQuantId
      ? `${candidate.name}:${selectedQuantId}`
      : candidate.name;

    // Derive suitability for display
    const modelForCheck = {
      name: modelName,
      provider: selectedProvider,
      providerModel,
      capabilities: {
        modalities: { input: inputModalities, output: ["text" as const] },
        streaming: true,
        tools: candidate.capabilities.tools ?? true,
        jsonSchema: candidate.capabilities.jsonSchema ?? false,
        structuredOutputs: false,
        reasoning: { supported: false },
        contextWindow: candidate.capabilities.contextWindow || 8192,
      },
      source: { url: candidate.source.url || url },
      pricing: null,
    };

    const suitableForBackend = isModelSuitableForBackend(modelForCheck);
    const suitableForWorkers = isModelSuitableForWorkers(modelForCheck);

    // Step 7: Show summary and confirm
    console.log(colors.subheader("\nImport Summary:"));
    console.log(colors.emphasis(`Model ID: ${modelId}`));
    console.log(`Name: ${modelName}`);
    console.log(`Provider: ${selectedProvider}`);
    console.log(`Provider Model: ${providerModel}`);
    console.log(
      `Suitable for: ${suitableForBackend ? "backend" : ""}${suitableForBackend && suitableForWorkers ? ", " : ""}${suitableForWorkers ? "workers" : ""}`,
    );
    if (selectedQuantId) {
      console.log(
        `Quantization: ${selectedQuantId}${selectedQuantSize ? ` (${formatFileSize(selectedQuantSize)})` : ""}`,
      );
    }

    const proceed = await confirm({
      message: "Proceed with importing this model?",
      initialValue: true,
    });

    if (!proceed) {
      cancel("Import cancelled");
      process.exit(0);
    }

    // Step 8: Import via backend API
    console.log(colors.header(`\n${icons.gear} Importing Model...`));

    try {
      const result = await importModelsViaApi([
        {
          id: modelId,
          name: modelName,
          provider: selectedProvider,
          providerModel,
          capabilities: {
            modalities: { input: inputModalities, output: ["text"] },
            streaming: true,
            tools: candidate.capabilities.tools ?? true,
            jsonSchema: candidate.capabilities.jsonSchema ?? false,
            structuredOutputs: false,
            reasoning: { supported: false },
            contextWindow: candidate.capabilities.contextWindow || 8192,
          },
          source: {
            url: candidate.source.url || url,
            format: candidate.source.format,
            quantization: selectedQuantId,
            sizeBytes: selectedQuantSize,
            visionSizeBytes: candidate.visionSizeBytes,
            architecture: candidate.architecture,
          },
        },
      ]);

      await closeDb();

      if (result.created.length > 0) {
        outro(`Model '${modelId}' imported successfully!`);
      } else if (result.skipped.length > 0) {
        outro(`Model '${modelId}' already exists (skipped)`);
      }

      console.log(
        colors.dim(
          `Run 'eclaire model activate ${modelId}' to activate this model`,
        ),
      );

      const contexts: string[] = [];
      if (suitableForBackend) contexts.push("backend");
      if (suitableForWorkers) contexts.push("workers");
      printProviderReminder(selectedProvider, contexts);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(colors.error(`${icons.error} ${message}`));
      process.exit(1);
    }
  } catch (error: unknown) {
    if (isCancelled(error)) {
      cancel("Import cancelled");
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.log(colors.error(`${icons.error} Import failed: ${message}`));
    process.exit(1);
  }
}
