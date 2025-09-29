import { getModels, getActiveModels, getActiveModelsAsObjects } from '../config/models.js';
import { createModelsTable, createActiveModelsTable } from '../ui/tables.js';
import { colors, icons } from '../ui/colors.js';
import type { CommandOptions, Model } from '../types/index.js';

export async function listCommand(options: CommandOptions): Promise<void> {
  try {
    console.log(colors.header(`${icons.inactive} Configured AI Models\n`));

    // Apply filters from options
    const filters: {
      context?: string;
      provider?: string;
    } = {};


    if (options.context) {
      if (!['backend', 'workers'].includes(options.context)) {
        console.log(colors.error(`${icons.error} Invalid context. Use 'backend' or 'workers'`));
        process.exit(1);
      }
      filters.context = options.context;
    }

    if (options.provider) {
      filters.provider = options.provider;
    }

    // Load models and active configuration
    const models = getModels(filters);
    const activeModels = getActiveModels();

    if (models.length === 0) {
      let message = 'No models found';
      if (Object.keys(filters).length > 0) {
        const filterStrings: string[] = [];
        if (filters.context) {
          filterStrings.push(`context: ${filters.context}`);
        }
        if (filters.provider) {
          filterStrings.push(`provider: ${filters.provider}`);
        }
        message += ` matching filters: ${filterStrings.join(', ')}`;
      }

      console.log(colors.warning(`${icons.warning} ${message}`));
      return;
    }

    // Output format
    if (options.json) {
      console.log(JSON.stringify({ models, activeModels }, null, 2));
      return;
    }

    // Show summary
    const totalModels = models.length;
    const activeCount = Object.keys(activeModels).length;

    console.log(colors.dim(`Found ${totalModels} models (${activeCount} active)\n`));

    // Show table
    const activeModelsObjects = getActiveModelsAsObjects();
    console.log(createModelsTable(models, activeModelsObjects));

    // Show active models summary if not filtered
    if (!options.context && !options.provider) {
      console.log(colors.subheader(`\n${icons.active} Active Models:`));
      console.log(colors.dim('These are the models currently being used by each service\n'));

      const activeTable = createActiveModelsTable(activeModelsObjects, models);
      console.log(activeTable);
    }

    // Show helpful commands
    console.log(colors.dim('\nCommands:'));
    console.log(colors.dim('  model-cli activate [ID]   - Activate a model (interactive if no ID)'));
    console.log(colors.dim('  model-cli deactivate [ctx] - Deactivate model for context (interactive if no context)'));
    console.log(colors.dim('  model-cli info <ID>       - Show detailed model info including description'));
    console.log(colors.dim('  model-cli import <url>    - Import new model'));
    console.log(colors.dim('  model-cli remove <ID>     - Remove a model (use ID from first column)'));

  } catch (error: any) {
    console.log(colors.error(`${icons.error} Failed to list models: ${error.message}`));
    process.exit(1);
  }
}