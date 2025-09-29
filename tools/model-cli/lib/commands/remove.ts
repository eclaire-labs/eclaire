import { removeModel, findModelById } from '../config/models.js';
import { promptConfirmation } from '../ui/prompts.js';
import { colors, icons } from '../ui/colors.js';
import type { CommandOptions } from '../types/index.js';

export async function removeCommand(id: string, options: CommandOptions): Promise<void> {
  try {
    const model = findModelById(id);
    if (!model) {
      console.log(colors.error(`${icons.error} Model not found: ${id}`));
      process.exit(1);
    }

    // Show model info
    console.log(colors.header(`${icons.warning} Remove Model\n`));
    console.log(`Model: ${colors.emphasis(model.modelFullName || model.name || model.id)}`);
    console.log(`Provider: ${colors.emphasis(model.provider)}`);
    console.log(`Short Name: ${colors.emphasis(model.modelShortName)}\n`);

    // Confirm removal unless --force flag
    if (!options.force) {
      const confirmed = await promptConfirmation(
        colors.warning('Are you sure you want to remove this model?'),
        false
      );

      if (!confirmed) {
        console.log(colors.dim('Cancelled by user'));
        return;
      }
    }

    removeModel(id);
    console.log(colors.success(`${icons.success} Removed model: ${model.provider}:${model.modelShortName}`));

  } catch (error: any) {
    console.log(colors.error(`${icons.error} Failed to remove model: ${error.message}`));
    process.exit(1);
  }
}