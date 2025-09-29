import inquirer from 'inquirer';
import { getActiveModels, getActiveModelsAsObjects, getModels, setActiveModel, setActiveModelByProvider, findModelById } from '../config/models.js';
import { createActiveModelsTable } from '../ui/tables.js';
import { promptContext, promptModelSelection } from '../ui/prompts.js';
import { colors, icons } from '../ui/colors.js';
import type { CommandOptions, Model } from '../types/index.js';

export async function activateCommand(id?: string, options: CommandOptions = {}): Promise<void> {
  try {
    // If specific options provided, set active models directly using provider:model format
    if (options.backend || options.workers) {
      if (options.backend) {
        const [provider, modelShortName] = options.backend.split(':');
        if (!provider || !modelShortName) {
          console.log(colors.error(`${icons.error} Invalid format. Use: provider:modelShortName`));
          process.exit(1);
        }

        const model = setActiveModelByProvider('backend', provider, modelShortName);
        console.log(colors.success(`${icons.success} Backend active model set to ${provider}:${modelShortName}`));
      }

      if (options.workers) {
        const [provider, modelShortName] = options.workers.split(':');
        if (!provider || !modelShortName) {
          console.log(colors.error(`${icons.error} Invalid format. Use: provider:modelShortName`));
          process.exit(1);
        }

        const model = setActiveModelByProvider('workers', provider, modelShortName);
        console.log(colors.success(`${icons.success} Workers active model set to ${provider}:${modelShortName}`));
      }
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
      console.log(colors.subheader('\n📋 Model Details:'));
      console.log(colors.emphasis(`Model: ${model.modelFullName || model.id}`));
      console.log(colors.info(`Short Name: ${model.modelShortName}`));
      console.log(colors.info(`Provider: ${model.provider}`));
      console.log(colors.info(`Supported Contexts: ${(model.contexts || []).join(', ')}`));
      if (model.description) {
        console.log(colors.info(`Description: ${model.description}`));
      }

      // Determine which contexts this model supports
      const supportedContexts = model.contexts || [];

      if (supportedContexts.length === 1) {
        // Model supports only one context - confirm and activate it
        const context = supportedContexts[0] as 'backend' | 'workers';

        const confirm = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: `Activate this model for ${context} context?`,
          default: true
        }]);

        if (!confirm.proceed) {
          console.log(colors.dim('Activation cancelled'));
          return;
        }

        const activatedModel = setActiveModelByProvider(context, model.provider, model.modelShortName);
        console.log(colors.success(`${icons.success} ${context} active model set to ${model.provider}:${model.modelShortName}`));
      } else {
        // Model supports multiple contexts - ask user which one
        const context = await promptContext(`Model ${id} supports multiple contexts. Which would you like to activate?`, supportedContexts);
        if (context === 'both') {
          // Handle both contexts
          setActiveModelByProvider('backend', model.provider, model.modelShortName);
          setActiveModelByProvider('workers', model.provider, model.modelShortName);
          console.log(colors.success(`${icons.success} Model activated for both backend and workers contexts`));
          return;
        }
        const activatedModel = setActiveModelByProvider(context as 'backend' | 'workers', model.provider, model.modelShortName);
        console.log(colors.success(`${icons.success} ${context} active model set to ${model.provider}:${model.modelShortName}`));
      }
      return;
    }

    // No ID provided - show current active models and enter interactive mode
    console.log(colors.header(`${icons.active} Active Models\n`));

    const activeModels = getActiveModelsAsObjects();
    const allModels = getModels();

    console.log(createActiveModelsTable(activeModels, allModels));

    // Interactive mode - ask user if they want to change active models
    console.log(colors.dim('\nInteractive Mode:'));
    console.log(colors.dim('Select a context to change its active model, or press Ctrl+C to exit\n'));

    // Select context to modify
    const context = await promptContext('Which context would you like to modify?');

    if (context === 'both') {
      // Handle both contexts
      for (const ctx of ['backend', 'workers'] as const) {
        await setActiveForContext(ctx, allModels);
      }
    } else {
      await setActiveForContext(context, allModels);
    }

  } catch (error: any) {
    if (error.message.includes('User force closed')) {
      console.log(colors.dim('\nCancelled by user'));
      return;
    }
    console.log(colors.error(`${icons.error} Failed to activate model: ${error.message}`));
    process.exit(1);
  }
}

async function setActiveForContext(context: 'backend' | 'workers', allModels: Model[]): Promise<void> {
  // Get available models for this context
  const availableModels = allModels.filter(m => {
    const modelContexts = m.contexts || [];
    return modelContexts.includes(context);
  });

  if (availableModels.length === 0) {
    console.log(colors.warning(`${icons.warning} No models available for ${context} context`));
    return;
  }

  // Let user select model
  const selected = await promptModelSelection(
    availableModels,
    `Select active model for ${context}:`
  );

  // Set active model
  setActiveModelByProvider(context, selected.provider, selected.modelShortName);

  console.log(colors.success(
    `${icons.success} ${context} active model set to ${selected.provider}:${selected.modelShortName}`
  ));
}

export async function deactivateCommand(context?: string): Promise<void> {
  try {
    const activeModels = getActiveModels();

    // If no context provided, show interactive selection
    if (!context) {
      // Get currently active contexts
      const activeContexts = Object.keys(activeModels).filter(ctx => activeModels[ctx as keyof typeof activeModels]);

      if (activeContexts.length === 0) {
        console.log(colors.warning(`${icons.warning} No active models to deactivate`));
        return;
      }

      if (activeContexts.length === 1) {
        // Only one active context, use it directly
        context = activeContexts[0];
      } else {
        // Multiple active contexts, let user choose
        context = await promptContext('Select context to deactivate:', activeContexts);
      }
    }

    // Validate context
    if (!context || !['backend', 'workers'].includes(context)) {
      console.log(colors.error(`${icons.error} Invalid context. Use 'backend' or 'workers'`));
      process.exit(1);
    }

    // Check if there's an active model for this context
    if (!activeModels[context as keyof typeof activeModels]) {
      console.log(colors.warning(`${icons.warning} No active model set for ${context} context`));
      return;
    }

    const currentModel = activeModels[context as keyof typeof activeModels];

    // Deactivate the model
    const { removeActiveModel } = await import('../config/models.js');
    removeActiveModel(context as 'backend' | 'workers');

    console.log(colors.success(
      `${icons.success} Deactivated ${currentModel} from ${context} context`
    ));

  } catch (error: any) {
    if (error.message.includes('User force closed')) {
      console.log(colors.dim('\nCancelled by user'));
      return;
    }
    console.log(colors.error(`${icons.error} Failed to deactivate model: ${error.message}`));
    process.exit(1);
  }
}