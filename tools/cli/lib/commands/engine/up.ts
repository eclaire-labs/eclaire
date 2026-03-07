/**
 * Engine up command
 *
 * Starts the llama-cpp engine with models from selection.json.
 */

import ora from "ora";
import {
  checkMemoryRequirements,
  formatMemorySize,
  type MemoryCheckResult,
  type ModelMemoryInput,
} from "../../engine/memory.js";
import {
  getEngineSettings,
  getServerStatus,
  resolveSelectionEngine,
  startLlamaServer,
} from "../../engine/process.js";
import { colors, icons } from "../../ui/colors.js";

interface UpOptions {
  foreground?: boolean;
  force?: boolean;
}

export async function upCommand(options: UpOptions = {}): Promise<void> {
  try {
    // Resolve what models need to be loaded from selection.json
    const resolution = resolveSelectionEngine();

    if (resolution.status === "no-managed") {
      console.log(colors.info(`${icons.info} ${resolution.message}`));
      console.log(
        colors.dim(
          "  Configure a managed llama-cpp provider in providers.json",
        ),
      );
      console.log(
        colors.dim(
          "  and select a model using that provider in selection.json",
        ),
      );
      return;
    }

    if (resolution.status === "conflict") {
      console.log(colors.error(`${icons.error} ${resolution.message}`));
      console.log(
        colors.dim(
          "  Update selection.json so all models use the same managed provider",
        ),
      );
      process.exit(1);
    }

    // Check if already running
    const status = getServerStatus(resolution.providerConfig);
    if (status.running) {
      console.log(
        colors.info(
          `${icons.info} llama-cpp engine is already running (PID: ${status.pid})`,
        ),
      );
      return;
    }

    // Run pre-flight memory check
    const memoryOk = await runMemoryPreflight(
      resolution,
      options.force ?? false,
    );
    if (!memoryOk) {
      process.exit(1);
    }

    console.log(colors.header(`\n${icons.rocket} Starting llama-cpp Engine\n`));

    // Show models being loaded
    const modelList = resolution.modelsToPreload
      .map((m) => `  - ${colors.info(m.context)}: ${m.providerModel}`)
      .join("\n");
    console.log(colors.dim(`Models to preload:\n${modelList}\n`));

    // biome-ignore lint/style/noNonNullAssertion: providerConfig is set when resolution.status is "ok"
    const settings = getEngineSettings(resolution.providerConfig!);
    const spinner = ora({
      text: `Starting llama-server on port ${settings.port}...`,
      color: "cyan",
    }).start();

    try {
      const hfModels = resolution.modelsToPreload.map((m) => m.providerModel);
      const pid = await startLlamaServer({
        hfModels,
        // biome-ignore lint/style/noNonNullAssertion: providerConfig is set when resolution.status is "ok"
        providerConfig: resolution.providerConfig!,
        foreground: options.foreground ?? false,
      });

      spinner.succeed(
        `llama-cpp engine started (PID: ${pid}, port: ${settings.port})`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      spinner.fail(`Failed to start engine: ${message}`);
      process.exit(1);
    }

    console.log("");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      colors.error(`${icons.error} Failed to start engine: ${message}`),
    );
    process.exit(1);
  }
}

/**
 * Run pre-flight memory check before starting the engine
 *
 * Returns true if it's safe to proceed, false if should abort.
 */
async function runMemoryPreflight(
  resolution: ReturnType<typeof resolveSelectionEngine>,
  force: boolean,
): Promise<boolean> {
  // Build memory inputs for each context model
  let backendModel: ModelMemoryInput | null = null;
  let workersModel: ModelMemoryInput | null = null;

  for (const modelInfo of resolution.modelsToPreload) {
    const model = modelInfo.modelConfig;

    // Use model's context window (provider no longer specifies contextSize)
    const contextSize = model.capabilities?.contextWindow ?? 8192;

    const memInput: ModelMemoryInput = {
      sizeBytes: model.source?.sizeBytes,
      contextSize,
      quantization: model.source?.quantization,
      modelId: modelInfo.modelId,
      architecture: model.source?.architecture,
      visionSizeBytes: model.source?.visionSizeBytes,
    };

    if (modelInfo.context === "backend") {
      backendModel = memInput;
    } else if (modelInfo.context === "workers") {
      workersModel = memInput;
    }
  }

  // If no models have size info, skip the check
  if (!backendModel?.sizeBytes && !workersModel?.sizeBytes) {
    return true;
  }

  try {
    const result = await checkMemoryRequirements(backendModel, workersModel);
    displayMemoryCheck(result);

    if (result.status === "warning" || result.status === "danger") {
      if (force) {
        console.log(
          colors.warning(`\n${icons.warning} Proceeding anyway (--force)\n`),
        );
        return true;
      }
      console.log(
        colors.warning(`\nUse ${colors.emphasis("--force")} to start anyway\n`),
      );
      return false;
    }

    return true;
  } catch (error: unknown) {
    // If VRAM detection fails, warn but allow proceeding
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      colors.warning(`\n${icons.warning} Could not check memory: ${message}`),
    );
    console.log(colors.dim("Proceeding without memory verification\n"));
    return true;
  }
}

/**
 * Display memory check results
 */
function displayMemoryCheck(result: MemoryCheckResult): void {
  const gpu = result.vramStatus.gpus[0];
  const gpuName = gpu?.name || "Unknown GPU";
  const memoryType = gpu?.isUnifiedMemory ? "unified" : "dedicated";

  console.log(colors.header("\nMemory Pre-flight Check\n"));
  console.log(
    `  GPU: ${colors.emphasis(gpuName)} (${formatMemorySize(result.vramStatus.totalVRAM)} ${memoryType})`,
  );
  console.log(
    `  Available: ~${formatMemorySize(result.vramStatus.availableVRAM)} (Metal GPU budget)\n`,
  );

  // Show per-model breakdown
  if (result.details.backend) {
    const est = result.details.backend;
    const modelId = est.modelId || "backend model";
    if (est.confidence !== "low") {
      console.log(`  ${colors.info("Backend")} (${modelId}):`);
      console.log(
        `    Model weights:    ${formatMemorySize(est.modelWeights)}`,
      );
      console.log(`    KV cache:         ${formatMemorySize(est.kvCache)}`);
      console.log(
        `    Compute buffers:  ${formatMemorySize(est.computeBuffers)}`,
      );
      console.log(colors.dim("    ───────────────────────"));
      console.log(`    Subtotal:         ${formatMemorySize(est.total)}\n`);
    } else {
      console.log(
        `  ${colors.info("Backend")}: ${colors.dim("Unknown (model size not available)")}\n`,
      );
    }
  }

  if (result.details.workers) {
    const est = result.details.workers;
    const modelId = est.modelId || "workers model";
    if (est.confidence !== "low") {
      console.log(`  ${colors.success("Workers")} (${modelId}):`);
      console.log(
        `    Model weights:    ${formatMemorySize(est.modelWeights)}`,
      );
      console.log(`    KV cache:         ${formatMemorySize(est.kvCache)}`);
      console.log(
        `    Compute buffers:  ${formatMemorySize(est.computeBuffers)}`,
      );
      console.log(colors.dim("    ───────────────────────"));
      console.log(`    Subtotal:         ${formatMemorySize(est.total)}\n`);
    } else {
      console.log(
        `  ${colors.success("Workers")}: ${colors.dim("Unknown (model size not available)")}\n`,
      );
    }
  }

  // Show totals
  if (result.requiredVRAM > 0) {
    console.log(colors.dim("  ═══════════════════════════════"));
    console.log(
      `  Total Required:     ${formatMemorySize(result.requiredVRAM)}`,
    );
    console.log(
      `  Available:          ${formatMemorySize(result.availableVRAM)}`,
    );

    if (result.headroom >= 0) {
      console.log(`  Headroom:           ${formatMemorySize(result.headroom)}`);
    } else {
      console.log(
        `  ${colors.error("Deficit:")}            ${formatMemorySize(Math.abs(result.headroom))}`,
      );
    }
  }

  // Status message
  console.log("");
  if (result.status === "ok") {
    console.log(colors.success(`  ${icons.success} ${result.message}`));
  } else if (result.status === "warning") {
    console.log(
      colors.warning(`  ${icons.warning} WARNING: ${result.message}`),
    );
    console.log("");
    console.log(colors.dim("  This may cause:"));
    console.log(colors.dim("  - Memory corruption or crashes"));
    console.log(colors.dim("  - System instability"));
    console.log(colors.dim("  - Model loading failures"));
    console.log("");
    console.log(colors.dim("  Recommendations:"));
    console.log(colors.dim("  - Use smaller models or lower quantization"));
    console.log(colors.dim("  - Reduce context size in model configuration"));
  }
}
