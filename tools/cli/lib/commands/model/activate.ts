import {
  findModelById,
  getActiveModelIdForContext,
  getActiveModelsAsObjects,
  getModels,
  isModelSuitableForBackend,
  isModelSuitableForContext,
  isModelSuitableForWorkers,
  removeActiveModel,
  setActiveModel,
} from "../../config/models.js";
import { closeDb } from "../../db/index.js";
import type { CommandOptions, Model } from "../../types/index.js";
import { cancel, confirm, intro, isCancelled, outro } from "../../ui/clack.js";
import { colors, icons, printProviderReminder } from "../../ui/colors.js";
import { promptContext, promptModelSelection } from "../../ui/prompts.js";
import { createActiveModelsTable } from "../../ui/tables.js";

export async function activateCommand(
  id?: string,
  options: CommandOptions = {},
): Promise<void> {
  try {
    intro("Activate Model");

    // If specific options provided, set active models directly by ID
    if (options.backend || options.workers) {
      if (options.backend) {
        const model = findModelById(options.backend);
        if (!model) {
          console.log(
            colors.error(`${icons.error} Model not found: ${options.backend}`),
          );
          process.exit(1);
        }
        if (!isModelSuitableForBackend(model)) {
          console.log(
            colors.error(
              `${icons.error} Model ${options.backend} is not suitable for backend context (requires text input)`,
            ),
          );
          process.exit(1);
        }
        await setActiveModel("backend", options.backend);
        console.log(
          colors.success(
            `${icons.success} Backend active model set to ${options.backend}`,
          ),
        );
        printProviderReminder(model.provider, ["backend"]);
      }

      if (options.workers) {
        const model = findModelById(options.workers);
        if (!model) {
          console.log(
            colors.error(`${icons.error} Model not found: ${options.workers}`),
          );
          process.exit(1);
        }
        if (!isModelSuitableForWorkers(model)) {
          console.log(
            colors.error(
              `${icons.error} Model ${options.workers} is not suitable for workers context (requires text + image input)`,
            ),
          );
          process.exit(1);
        }
        await setActiveModel("workers", options.workers);
        console.log(
          colors.success(
            `${icons.success} Workers active model set to ${options.workers}`,
          ),
        );
        printProviderReminder(model.provider, ["workers"]);
      }
      outro("Done");
      await closeDb();
      return;
    }

    // If ID is provided, activate that specific model
    if (id) {
      const model = findModelById(id);
      if (!model) {
        console.log(colors.error(`${icons.error} Model not found: ${id}`));
        process.exit(1);
      }

      // Show model details
      console.log(colors.subheader("\nModel Details:"));
      console.log(colors.emphasis(`Model: ${model.name}`));
      console.log(colors.info(`ID: ${id}`));
      console.log(colors.info(`Provider: ${model.provider}`));
      console.log(colors.info(`Provider Model: ${model.providerModel}`));

      // Determine which contexts this model supports (derived from modalities)
      const supportedContexts: string[] = [];
      if (isModelSuitableForBackend(model)) supportedContexts.push("backend");
      if (isModelSuitableForWorkers(model)) supportedContexts.push("workers");

      console.log(
        colors.info(`Supported Contexts: ${supportedContexts.join(", ")}`),
      );

      if (supportedContexts.length === 1) {
        // Model supports only one context - confirm and activate it
        const context = supportedContexts[0] as "backend" | "workers";

        const proceed = await confirm({
          message: `Activate this model for ${context} context?`,
          initialValue: true,
        });

        if (!proceed) {
          cancel("Activation cancelled");
          return;
        }

        await setActiveModel(context, id);
        console.log(
          colors.success(
            `${icons.success} ${context} active model set to ${id}`,
          ),
        );
        printProviderReminder(model.provider, [context]);
      } else {
        // Model supports multiple contexts - ask user which one
        const context = await promptContext(
          `Model ${id} supports multiple contexts. Which would you like to activate?`,
          supportedContexts,
        );
        if (context === "both") {
          // Handle both contexts
          await setActiveModel("backend", id);
          await setActiveModel("workers", id);
          console.log(
            colors.success(
              `${icons.success} Model activated for both backend and workers contexts`,
            ),
          );
          printProviderReminder(model.provider, ["backend", "workers"]);
          outro("Done");
          await closeDb();
          return;
        }
        await setActiveModel(context as "backend" | "workers", id);
        console.log(
          colors.success(
            `${icons.success} ${context} active model set to ${id}`,
          ),
        );
        printProviderReminder(model.provider, [context]);
      }
      outro("Done");
      await closeDb();
      return;
    }

    // No ID provided - show current active models and enter interactive mode
    console.log(colors.header(`${icons.active} Active Models\n`));

    const activeModels = getActiveModelsAsObjects();
    const allModels = getModels();

    console.log(createActiveModelsTable(activeModels, allModels));

    // Interactive mode - ask user if they want to change active models
    console.log(colors.dim("\nInteractive Mode:"));
    console.log(
      colors.dim(
        "Select a context to change its active model, or press Ctrl+C to exit\n",
      ),
    );

    // Select context to modify
    const context = await promptContext(
      "Which context would you like to modify?",
    );

    if (context === "both") {
      // Handle both contexts
      for (const ctx of ["backend", "workers"] as const) {
        await setActiveForContext(ctx, allModels);
      }
    } else {
      await setActiveForContext(context, allModels);
    }
    outro("Done");
    await closeDb();
  } catch (error: unknown) {
    if (isCancelled(error)) {
      cancel("Cancelled");
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      colors.error(`${icons.error} Failed to activate model: ${message}`),
    );
    process.exit(1);
  }
}

async function setActiveForContext(
  context: "backend" | "workers",
  allModels: Array<{ id: string; model: Model }>,
): Promise<void> {
  // Get available models for this context (derived from modalities)
  const availableModels = allModels.filter(({ model }) =>
    isModelSuitableForContext(model, context),
  );

  if (availableModels.length === 0) {
    console.log(
      colors.warning(
        `${icons.warning} No models available for ${context} context`,
      ),
    );
    return;
  }

  // Let user select model
  const selected = await promptModelSelection(
    availableModels,
    `Select active model for ${context}:`,
  );

  // Set active model
  await setActiveModel(context, selected.id);

  console.log(
    colors.success(
      `${icons.success} ${context} active model set to ${selected.id}`,
    ),
  );
  printProviderReminder(selected.model.provider, [context]);
}

export async function deactivateCommand(context?: string): Promise<void> {
  try {
    const activeModels = {
      backend: getActiveModelIdForContext("backend") || undefined,
      workers: getActiveModelIdForContext("workers") || undefined,
    };

    // If no context provided, show interactive selection
    if (!context) {
      // Get currently active contexts
      const activeContexts = Object.keys(activeModels).filter(
        (ctx) => activeModels[ctx as keyof typeof activeModels],
      );

      if (activeContexts.length === 0) {
        console.log(
          colors.warning(`${icons.warning} No active models to deactivate`),
        );
        return;
      }

      if (activeContexts.length === 1) {
        // Only one active context, use it directly
        context = activeContexts[0];
      } else {
        // Multiple active contexts, let user choose
        context = await promptContext(
          "Select context to deactivate:",
          activeContexts,
        );
      }
    }

    // Validate context
    if (!context || !["backend", "workers"].includes(context)) {
      console.log(
        colors.error(
          `${icons.error} Invalid context. Use 'backend' or 'workers'`,
        ),
      );
      process.exit(1);
    }

    // Check if there's an active model for this context
    const currentModelId = activeModels[context as keyof typeof activeModels];
    if (!currentModelId) {
      console.log(
        colors.warning(
          `${icons.warning} No active model set for ${context} context`,
        ),
      );
      return;
    }

    // Deactivate the model
    await removeActiveModel(context as "backend" | "workers");

    console.log(
      colors.success(
        `${icons.success} Deactivated ${currentModelId} from ${context} context`,
      ),
    );
    await closeDb();
  } catch (error: unknown) {
    if (isCancelled(error)) {
      cancel("Cancelled");
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      colors.error(`${icons.error} Failed to deactivate model: ${message}`),
    );
    process.exit(1);
  }
}
