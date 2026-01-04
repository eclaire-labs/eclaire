/**
 * Engine pull command
 *
 * Downloads models from HuggingFace.
 */

import ora from 'ora';
import { colors, icons } from '../../ui/colors.js';
import { downloadModel, formatBytes } from '../../engine/download.js';
import { getModelsDir } from '../../engine/paths.js';
import { findModelById, updateModel } from '../../config/models.js';
import type { CommandOptions } from '../../types/index.js';

interface PullOptions extends CommandOptions {
  modelId?: string;
}

export async function pullCommand(
  modelRef: string,
  options: PullOptions = {}
): Promise<void> {
  try {
    console.log(colors.header(`\n${icons.download} Downloading Model\n`));
    console.log(colors.dim(`Source: ${modelRef}`));
    console.log(colors.dim(`Destination: ${getModelsDir()}`));
    console.log('');

    const spinner = ora({
      text: 'Preparing download...',
      color: 'cyan',
    }).start();

    const result = await downloadModel(modelRef);

    if (!result.success) {
      spinner.fail(`Download failed: ${result.error}`);
      process.exit(1);
    }

    const sizeStr = result.sizeBytes ? formatBytes(result.sizeBytes) : 'unknown size';
    spinner.succeed(`Download complete (${sizeStr})`);

    console.log('');
    console.log(colors.success(`${icons.success} Model saved to:`));
    console.log(colors.dim(`  ${result.localPath}`));

    // Update model config if --model-id was provided
    if (options.modelId) {
      await updateModelWithLocalPath(options.modelId, result.localPath!);
    } else {
      console.log('');
      console.log(colors.subheader('Next steps:'));
      console.log(colors.dim('  1. Update your model config with the local path:'));
      console.log(colors.dim(`     eclaire model info <model-id>`));
      console.log(colors.dim('  2. Or use --model-id to auto-update:'));
      console.log(colors.dim(`     eclaire engine pull ${modelRef} --model-id <model-id>`));
    }

    console.log('');
  } catch (error: any) {
    console.log(colors.error(`${icons.error} Pull failed: ${error.message}`));
    process.exit(1);
  }
}

async function updateModelWithLocalPath(
  modelId: string,
  localPath: string
): Promise<void> {
  const model = findModelById(modelId);

  if (!model) {
    console.log('');
    console.log(colors.warning(`${icons.warning} Model '${modelId}' not found in config`));
    console.log(colors.dim('  The model was downloaded but config was not updated.'));
    console.log(colors.dim('  You may need to add the model manually or check the model ID.'));
    return;
  }

  try {
    // Update the model's source with the local path
    const updatedModel = {
      ...model,
      source: {
        ...model.source,
        localPath,
      },
    };

    updateModel(modelId, updatedModel);

    console.log('');
    console.log(colors.success(`${icons.success} Updated model '${modelId}' with local path`));
  } catch (error: any) {
    console.log('');
    console.log(colors.warning(`${icons.warning} Failed to update model config: ${error.message}`));
    console.log(colors.dim('  The model was downloaded but config was not updated.'));
  }
}
