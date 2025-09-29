import { findModelById, getActiveModelsAsObjects } from '../config/models.js';
import { createInfoTable } from '../ui/tables.js';
import { colors, icons, formatProvider, formatContext, formatStatus } from '../ui/colors.js';
import type { CommandOptions } from '../types/index.js';

export async function infoCommand(id: string): Promise<void> {
  try {
    const model = findModelById(id);
    if (!model) {
      console.log(colors.error(`${icons.error} Model not found: ${id}`));
      process.exit(1);
    }

    console.log(colors.header(`${icons.info} Model Information: ${id}\n`));

    // Get active models to determine if this model is active
    const activeModels = getActiveModelsAsObjects();

    // Check if model is active
    function isModelActive(model: any): boolean {
      return Object.values(activeModels).some((active: any) =>
        active &&
        active.provider === model.provider &&
        active.modelShortName === model.modelShortName
      );
    }

    const isActive = isModelActive(model);

    // Create info table with reorganized field order
    const info: Record<string, any> = {
      'ID': model.id,
      'Provider': formatProvider(model.provider),
      'Model Short Name': model.modelShortName,
    };

    // Add Model Full Name right after Model Short Name if it exists
    if (model.modelFullName) {
      info['Model Full Name'] = model.modelFullName;
    }

    // Add Model URL right after Model Full Name if it exists
    if (model.modelUrl) {
      info['Model URL'] = colors.dim(model.modelUrl);
    }

    // Add Provider URL, Contexts and Status after model fields
    if (model.providerUrl) {
      info['Provider URL'] = colors.dim(model.providerUrl);
    }

    info['Contexts'] = formatContext(model.contexts);
    info['Status'] = formatStatus(isActive);


    // Add optional fields if they exist
    if (model.description) {
      info['Description'] = model.description;
    }

    if (model.maxTokens) {
      info['Max Tokens'] = model.maxTokens.toLocaleString();
    }

    if (model.temperature !== undefined) {
      info['Temperature'] = model.temperature;
    }

    if (model.apiUrl) {
      info['API URL'] = colors.dim(model.apiUrl);
    }

    if (model.apiKey) {
      info['API Key'] = colors.dim('[CONFIGURED]');
    } else {
      info['API Key'] = colors.dim('none');
    }

    if (model.tags && model.tags.length > 0) {
      info['Tags'] = model.tags.join(', ');
    }

    if (model.inputTokenPrice !== undefined) {
      info['Input Token Price'] = `$${model.inputTokenPrice}`;
    }

    if (model.outputTokenPrice !== undefined) {
      info['Output Token Price'] = `$${model.outputTokenPrice}`;
    }

    // Add metadata information if available
    if (model.metadata) {
      if (model.metadata.url) {
        info['Model URL'] = colors.dim(model.metadata.url);
      }
      if (model.metadata.isGGUF) {
        info['GGUF Format'] = colors.success('Yes');
      }
      if (model.metadata.modality) {
        info['Modality'] = model.metadata.modality;
      }
    }

    console.log(createInfoTable(info));

  } catch (error: any) {
    console.log(colors.error(`${icons.error} Failed to show model info: ${error.message}`));
    process.exit(1);
  }
}