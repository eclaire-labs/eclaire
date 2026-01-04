import { findModelById, getActiveModelsAsObjects, getProvider } from '../../config/models.js';
import { createInfoTable } from '../../ui/tables.js';
import { colors, icons, formatProvider, formatSuitability } from '../../ui/colors.js';
import { estimateModelMemory, formatMemorySize } from '../../engine/memory.js';

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
    const isActiveBackend = activeModels.backend?.id === id;
    const isActiveWorkers = activeModels.workers?.id === id;
    const isActive = isActiveBackend || isActiveWorkers;

    // Build info display
    const info: Record<string, any> = {
      'ID': id,
      'Name': model.name,
      'Provider': formatProvider(model.provider),
      'Provider Model': model.providerModel,
    };

    // Add suitability/contexts (derived from modalities)
    info['Suitability'] = formatSuitability(model);

    // Add status
    if (isActive) {
      const activeContexts: string[] = [];
      if (isActiveBackend) activeContexts.push('backend');
      if (isActiveWorkers) activeContexts.push('workers');
      info['Status'] = colors.active(`ACTIVE (${activeContexts.join(', ')})`);
    } else {
      info['Status'] = colors.inactive('INACTIVE');
    }

    // Add capabilities
    console.log(createInfoTable(info));

    // Capabilities section
    console.log(colors.subheader('\nCapabilities:'));
    const capabilities = model.capabilities;
    const capsInfo: Record<string, any> = {
      'Context Window': capabilities.contextWindow.toLocaleString() + ' tokens',
      'Streaming': capabilities.streaming ? colors.success('Yes') : colors.dim('No'),
      'Tools': capabilities.tools ? colors.success('Yes') : colors.dim('No'),
      'JSON Schema': capabilities.jsonSchema ? colors.success('Yes') : colors.dim('No'),
      'Structured Outputs': capabilities.structuredOutputs ? colors.success('Yes') : colors.dim('No'),
      'Reasoning': capabilities.reasoning.supported ? colors.success('Yes') : colors.dim('No'),
    };

    if (capabilities.maxOutputTokens) {
      capsInfo['Max Output Tokens'] = capabilities.maxOutputTokens.toLocaleString();
    }

    // Input modalities
    capsInfo['Input Modalities'] = capabilities.modalities.input.join(', ');
    capsInfo['Output Modalities'] = capabilities.modalities.output.join(', ');

    console.log(createInfoTable(capsInfo));

    // Source section
    console.log(colors.subheader('\nSource:'));
    const sourceInfo: Record<string, any> = {
      'URL': colors.dim(model.source.url),
    };
    if (model.source.format) {
      sourceInfo['Format'] = model.source.format;
    }
    if (model.source.quantization) {
      sourceInfo['Quantization'] = model.source.quantization;
    }
    if (model.source.sizeBytes) {
      const sizeGB = (model.source.sizeBytes / (1024 * 1024 * 1024)).toFixed(2);
      sourceInfo['Size'] = `${sizeGB} GB`;
    }
    console.log(createInfoTable(sourceInfo));

    // Get provider config for memory estimates and provider info display
    const providerConfig = getProvider(model.provider);

    // Memory estimates section (for local models with sizeBytes)
    if (model.source.sizeBytes && model.source.format === 'gguf') {
      console.log(colors.subheader('\nMemory Estimates:'));

      // Get context size from provider config if available, otherwise use defaults
      const contextSize = providerConfig?.engine?.contextSize ?? 8192;

      const estimate = estimateModelMemory(
        model.source.sizeBytes,
        contextSize,
        model.source.architecture,
        model.source.visionSizeBytes
      );

      const memoryInfo: Record<string, any> = {
        [`Context Size`]: `${contextSize.toLocaleString()} tokens`,
        [`Estimated Memory`]: `~${formatMemorySize(estimate.total)}`,
      };
      console.log(createInfoTable(memoryInfo));

      // Show confidence level and architecture info if available
      if (model.source.architecture) {
        console.log(colors.dim(`  * Architecture: ${model.source.architecture.layers} layers, ${model.source.architecture.kvHeads} KV heads`));
      }
      console.log(colors.dim('  * Estimates include model weights, KV cache, and compute buffers'));
    }

    // Provider info
    if (providerConfig) {
      console.log(colors.subheader('\nProvider Configuration:'));
      const providerInfo: Record<string, any> = {
        'Dialect': providerConfig.dialect,
        'Base URL': colors.dim(providerConfig.baseUrl),
        'Auth Type': providerConfig.auth.type,
      };
      console.log(createInfoTable(providerInfo));
    }

    // Pricing section (if present)
    if (model.pricing) {
      console.log(colors.subheader('\nPricing (per 1M tokens):'));
      const pricingInfo: Record<string, any> = {
        'Input': `$${model.pricing.inputPer1M.toFixed(4)}`,
        'Output': `$${model.pricing.outputPer1M.toFixed(4)}`,
      };
      console.log(createInfoTable(pricingInfo));
    }

    // Tokenizer info (if present)
    if (model.tokenizer) {
      console.log(colors.subheader('\nTokenizer:'));
      const tokenizerInfo: Record<string, any> = {
        'Type': model.tokenizer.type,
      };
      if (model.tokenizer.name) {
        tokenizerInfo['Name'] = model.tokenizer.name;
      }
      console.log(createInfoTable(tokenizerInfo));
    }

  } catch (error: any) {
    console.log(colors.error(`${icons.error} Failed to show model info: ${error.message}`));
    process.exit(1);
  }
}
