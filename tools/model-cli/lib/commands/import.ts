import axios from 'axios';
import ora from 'ora';
import inquirer from 'inquirer';
import { addModel, loadModelsConfig, saveModelsConfig } from '../config/models.js';
import { colors, icons } from '../ui/colors.js';
import type { CommandOptions, Model } from '../types/index.js';

interface ModelInfo {
  name: string;
  modelShortName: string;
  apiModelId: string;
  description: string;
  provider: string;
  contexts: string[];
  url?: string;
  apiEndpoint?: string;
  maxTokens?: number;
  pipeline_tag?: string;
  isGGUF?: boolean;
  quantizations?: QuantizationInfo[];
  selectedQuantization?: QuantizationInfo;
  fileSize?: number;
  pricing?: any;
  architecture?: any;
  modality?: string;
}

interface QuantizationInfo {
  filename: string;
  size: number;
  quantization: string;
  sizeFormatted: string;
}

interface ValidationResult {
  valid: boolean;
  issues: Array<{ message: string; severity: string }>;
}

export async function importCommand(url: string, options: CommandOptions): Promise<void> {
  try {
    // Validate URL format
    if (!isValidUrl(url)) {
      console.log(colors.error(`${icons.error} Invalid URL format`));
      process.exit(1);
    }

    const urlType = getUrlType(url);
    if (!urlType) {
      console.log(colors.error(`${icons.error} Unsupported URL. Only HuggingFace and OpenRouter URLs are supported`));
      console.log(colors.dim('Examples:'));
      console.log(colors.dim('  https://huggingface.co/microsoft/DialoGPT-medium'));
      console.log(colors.dim('  https://openrouter.ai/models/anthropic/claude-3.5-sonnet'));
      process.exit(1);
    }

    console.log(colors.header(`${icons.robot} Importing Model from ${urlType}\n`));
    console.log(colors.dim(`URL: ${url}`));

    const spinner = ora('Fetching model information...').start();
    let modelInfo: ModelInfo;

    try {
      if (urlType === 'huggingface') {
        modelInfo = await fetchHuggingFaceModel(url);
      } else if (urlType === 'openrouter') {
        modelInfo = await fetchOpenRouterModel(url);
      } else {
        throw new Error('Unsupported URL type');
      }

      spinner.succeed('Model information retrieved');
    } catch (error: any) {
      spinner.fail('Failed to fetch model information');
      console.log(colors.error(`${icons.error} ${error.message}`));
      process.exit(1);
    }

    // Display model information
    console.log(colors.subheader('\nModel Information:'));
    console.log(colors.info(`Name: ${modelInfo.name}`));
    console.log(colors.emphasis(`API Model ID: ${modelInfo.apiModelId}`));
    console.log(colors.info(`Description: ${modelInfo.description || 'No description available'}`));
    console.log(colors.info(`Provider: ${modelInfo.provider}`));
    console.log(colors.info(`Context: ${modelInfo.contexts.join(', ')}`));
    if (modelInfo.maxTokens) {
      console.log(colors.info(`Max Tokens: ${modelInfo.maxTokens}`));
    }

    // Show quantization options for GGUF models and prompt for selection
    if (modelInfo.isGGUF && modelInfo.quantizations && modelInfo.quantizations.length > 0) {
      console.log(colors.subheader('\n📊 Available Quantizations:'));
      console.log(colors.dim('These are the different compressed versions available:'));

      const Table = (await import('cli-table3')).default;
      const quantTable = new Table({
        head: [colors.header('Quantization'), colors.header('Size'), colors.header('Filename')],
        colWidths: [15, 12, 35],
        style: { head: [], border: ['gray'] }
      });

      modelInfo.quantizations.slice(0, 10).forEach(q => {
        quantTable.push([
          colors.emphasis(q.quantization),
          q.sizeFormatted,
          colors.dim(q.filename)
        ]);
      });

      console.log(quantTable.toString());
      if (modelInfo.quantizations.length > 10) {
        console.log(colors.dim(`... and ${modelInfo.quantizations.length - 10} more quantizations`));
      }

      // Prompt user to select quantization immediately
      const quantChoice = await inquirer.prompt([{
        type: 'list',
        name: 'selectedQuantization',
        message: 'Select quantization (affects model size and quality):',
        choices: modelInfo.quantizations.map(q => ({
          name: `${q.quantization} (${q.sizeFormatted}) - ${q.filename}`,
          value: q,
          short: q.quantization
        })),
        default: 0 // Default to first (usually smallest)
      }]);

      // Apply quantization selection immediately
      const quant = quantChoice.selectedQuantization;
      modelInfo.name += `:${quant.quantization}`;
      modelInfo.modelShortName += `-${quant.quantization.toLowerCase()}`;
      modelInfo.description += ` (${quant.quantization} quantization, ${quant.sizeFormatted})`;
      modelInfo.selectedQuantization = quant;
      modelInfo.fileSize = quant.size;
    }

    // Interactive configuration if not in non-interactive mode
    if (!options.interactive) {
      const questions: any[] = [
        {
          type: 'input',
          name: 'modelShortName',
          message: 'Model short name:',
          default: modelInfo.modelShortName,
          validate: (input: string) => input.trim().length > 0 || 'Short name is required'
        },
        {
          type: 'checkbox',
          name: 'contexts',
          message: 'Select contexts for this model:',
          choices: [
            { name: 'Backend', value: 'backend' },
            { name: 'Workers', value: 'workers' }
          ],
          default: modelInfo.contexts,
          validate: (input: string[]) => input.length > 0 || 'At least one context must be selected'
        }
      ];


      questions.push(
        {
          type: 'input',
          name: 'provider',
          message: 'Provider:',
          default: options.provider || modelInfo.provider,
          validate: (input: string) => input.trim().length > 0 || 'Provider is required'
        },
        {
          type: 'input',
          name: 'maxTokens',
          message: 'Max tokens (optional):',
          default: modelInfo.maxTokens,
          filter: (input: string) => input ? parseInt(input) : undefined,
          validate: (input: string) => !input || (!isNaN(Number(input)) && parseInt(input) > 0) || 'Must be a positive number'
        },
      );

      const answers = await inquirer.prompt(questions);

      // Update model info with user choices
      modelInfo.modelShortName = answers.modelShortName;
      modelInfo.contexts = answers.contexts;
      modelInfo.provider = answers.provider;
      modelInfo.maxTokens = answers.maxTokens;

    } else {
      // Use command line options in non-interactive mode
      if (options.provider) {
        modelInfo.provider = options.provider;
      }
      if (options.context && options.context !== 'both') {
        modelInfo.contexts = [options.context];
      }
    }

    // Validate the model entry
    const validation = validateModelEntry(modelInfo);
    if (!validation.valid) {
      console.log(colors.error(`${icons.error} Model configuration is invalid:`));
      validation.issues.forEach(issue => {
        console.log(colors.error(`  - ${issue.message}`));
      });
      process.exit(1);
    }

    // Final confirmation before importing
    console.log(colors.subheader('\n📋 Import Summary:'));
    console.log(colors.emphasis(`Model: ${modelInfo.name}`));
    console.log(colors.info(`Short Name: ${modelInfo.modelShortName}`));
    console.log(colors.info(`Provider: ${modelInfo.provider}`));
    console.log(colors.info(`Contexts: ${modelInfo.contexts.join(', ')}`));
    if (modelInfo.maxTokens) {
      console.log(colors.info(`Max Tokens: ${modelInfo.maxTokens}`));
    }
    if (modelInfo.selectedQuantization) {
      console.log(colors.info(`Quantization: ${modelInfo.selectedQuantization.quantization} (${modelInfo.selectedQuantization.sizeFormatted})`));
    }

    const confirm = await inquirer.prompt([{
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with importing this model?',
      default: true
    }]);

    if (!confirm.proceed) {
      console.log(colors.dim('Import cancelled'));
      process.exit(0);
    }

    // Convert ModelInfo to Model format
    const model: Model = {
      id: generateModelId(modelInfo),
      modelFullName: modelInfo.url?.includes('openrouter.ai') ? modelInfo.apiModelId : modelInfo.name,
      provider: modelInfo.provider,
      modelShortName: modelInfo.modelShortName,
      modelUrl: modelInfo.url,
      providerUrl: modelInfo.url?.includes('openrouter.ai') ? '${AI_PROXY_PROVIDER_URL}' : '${AI_LOCAL_PROVIDER_URL}',
      apiKey: modelInfo.url?.includes('openrouter.ai') ? '${AI_PROXY_API_KEY}' : undefined,
      capabilities: {
        stream: true,
        thinking: {
          mode: 'never'
        }
      },
      contexts: modelInfo.contexts,
      maxTokens: modelInfo.maxTokens,
      description: modelInfo.description,
      metadata: {
        url: modelInfo.url,
        apiEndpoint: modelInfo.apiEndpoint,
        apiModelId: modelInfo.apiModelId,
        isGGUF: modelInfo.isGGUF,
        selectedQuantization: modelInfo.selectedQuantization,
        pricing: modelInfo.pricing,
        architecture: modelInfo.architecture,
        modality: modelInfo.modality
      }
    };

    // Add the model
    console.log(colors.header(`\n${icons.gear} Adding Model...`));

    try {
      addModel(model);
      console.log(colors.success(`${icons.success} Model '${modelInfo.modelShortName}' imported successfully!`));
      console.log(colors.dim(`Run 'model-cli activate ${model.id}' to activate this model`));
    } catch (error: any) {
      console.log(colors.error(`${icons.error} ${error.message}`));
      process.exit(1);
    }

  } catch (error: any) {
    console.log(colors.error(`${icons.error} Import failed: ${error.message}`));
    process.exit(1);
  }
}

function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function getUrlType(url: string): string | null {
  if (url.includes('huggingface.co')) {
    return 'huggingface';
  }
  if (url.includes('openrouter.ai')) {
    return 'openrouter';
  }
  return null;
}

async function fetchHuggingFaceModel(url: string): Promise<ModelInfo> {
  // Extract model ID from URL
  const match = url.match(/huggingface\.co\/([^\/]+\/[^\/\?#]+)/);
  if (!match) {
    throw new Error('Invalid HuggingFace URL format');
  }

  const modelId = match[1];
  if (!modelId) {
    throw new Error('Unable to extract model ID from URL');
  }

  try {
    // Fetch model info from HuggingFace API
    const response = await axios.get(`https://huggingface.co/api/models/${modelId}`, {
      headers: {
        'User-Agent': 'model-cli/1.0.0'
      },
      timeout: 10000
    });

    const data = response.data as any; // API response structure varies

    // Better description extraction
    let description = '';
    if (data.cardData?.description) {
      description = data.cardData.description;
    } else if (data.description) {
      description = data.description;
    } else if (data.tags && data.tags.length > 0) {
      // Generate description from tags if no explicit description
      description = `${data.pipeline_tag || 'Model'} with tags: ${data.tags.slice(0, 5).join(', ')}`;
    } else {
      description = `${data.pipeline_tag || 'HuggingFace'} model`;
    }

    // Extract model information
    let modelInfo: ModelInfo = {
      name: data.modelId || modelId,
      modelShortName: generateShortName(modelId),
      apiModelId: modelId, // The identifier used for API calls
      description,
      provider: 'huggingface',
      contexts: ['backend', 'workers'], // Default to both
      url: `https://huggingface.co/${modelId}`,
      apiEndpoint: `https://api-inference.huggingface.co/models/${modelId}`,
      maxTokens: extractMaxTokens(data),
      pipeline_tag: data.pipeline_tag,
      isGGUF: false,
      quantizations: []
    };

    // Check if this is a GGUF repository by looking for .gguf files
    if (modelId.toLowerCase().includes('gguf') || data.tags?.includes('gguf')) {
      try {
        const filesResponse = await axios.get(`https://huggingface.co/api/models/${modelId}/tree/main`, {
          headers: { 'User-Agent': 'model-cli/1.0.0' },
          timeout: 10000
        });

        const files = (filesResponse.data as any) || [];
        const ggufFiles = files.filter((file: any) => file.path?.endsWith('.gguf'));

        if (ggufFiles.length > 0) {
          modelInfo.isGGUF = true;
          modelInfo.provider = 'llamacpp'; // Use llamacpp for GGUF models
          modelInfo.quantizations = ggufFiles.map((file: any) => ({
            filename: file.path,
            size: file.size,
            quantization: extractQuantizationType(file.path),
            sizeFormatted: formatFileSize(file.size)
          })).sort((a: QuantizationInfo, b: QuantizationInfo) => a.size - b.size);

          modelInfo.description += ` (GGUF format with ${modelInfo.quantizations?.length || 0} quantization options)`;
        }
      } catch (filesError) {
        // If we can't fetch files, continue without quantization info
        console.warn(`Could not fetch file list for ${modelId}`);
      }
    }

    return modelInfo;

  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`Model '${modelId}' not found on HuggingFace`);
    }
    if (error.response?.status === 403) {
      throw new Error(`Access denied to model '${modelId}'. It may be private or gated.`);
    }
    throw new Error(`Failed to fetch HuggingFace model: ${error.message}`);
  }
}

async function fetchOpenRouterModel(url: string): Promise<ModelInfo> {
  // Extract model ID from URL - handle both formats:
  // https://openrouter.ai/models/provider/model
  // https://openrouter.ai/provider/model
  const match = url.match(/openrouter\.ai\/(?:models\/)?([^\/\?#]+\/[^\/\?#]+)/);
  if (!match) {
    throw new Error('Invalid OpenRouter URL format');
  }

  const modelId = match[1];
  if (!modelId) {
    throw new Error('Unable to extract model ID from URL');
  }

  try {
    // Fetch model info from OpenRouter API
    const response = await axios.get('https://openrouter.ai/api/v1/models', {
      headers: {
        'User-Agent': 'model-cli/1.0.0'
      },
      timeout: 10000
    });

    const models = (response.data as any).data;
    const model = models.find((m: any) => m.id === modelId);

    if (!model) {
      throw new Error(`Model '${modelId}' not found on OpenRouter`);
    }

    // Enhanced description with key model info
    let description = model.description || '';
    if (!description) {
      description = `OpenRouter model: ${model.name || modelId}`;
    }

    // Calculate pricing per 1M tokens with proper validation
    let promptCost = 0;
    let completionCost = 0;
    if (model.pricing && typeof model.pricing === 'object') {
      const prompt = parseFloat(model.pricing.prompt || '0');
      const completion = parseFloat(model.pricing.completion || '0');

      if (!isNaN(prompt) && !isNaN(completion)) {
        promptCost = prompt * 1000000; // Convert to per million tokens
        completionCost = completion * 1000000;
        description += ` (Pricing: $${promptCost.toFixed(2)}/$${completionCost.toFixed(2)} per 1M tokens)`;
      }
    }

    // Add context length info
    if (model.context_length) {
      description += ` | Context: ${model.context_length.toLocaleString()} tokens`;
    }

    // Extract modality from architecture object
    let modality = 'text->text'; // Default
    if (model.architecture && typeof model.architecture === 'object') {
      const inputMods = model.architecture.input_modalities || [];
      const outputMods = model.architecture.output_modalities || [];

      if (Array.isArray(inputMods) && Array.isArray(outputMods)) {
        const inputStr = inputMods.join(',');
        const outputStr = outputMods.join(',');
        modality = `${inputStr}->${outputStr}`;
      }
    } else if (model.modality && typeof model.modality === 'string') {
      // Fallback to legacy modality field if present
      modality = model.modality;
    }

    // Extract model information with proper validation
    const modelInfo: ModelInfo = {
      name: model.name || modelId,
      modelShortName: generateShortName(modelId),
      apiModelId: modelId, // The identifier used for API calls
      description,
      provider: 'proxy',
      contexts: ['backend', 'workers'], // Default to both
      url: `https://openrouter.ai/models/${modelId}`,
      apiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
      maxTokens: typeof model.context_length === 'number' ? model.context_length : undefined,
      pricing: {
        prompt: model.pricing?.prompt || '0',
        completion: model.pricing?.completion || '0',
        promptPer1M: promptCost,
        completionPer1M: completionCost
      },
      architecture: model.architecture,
      modality: modality
    };

    return modelInfo;

  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`OpenRouter API not found or model '${modelId}' doesn't exist`);
    }
    throw new Error(`Failed to fetch OpenRouter model: ${error.message}`);
  }
}


function generateShortName(modelId: string): string {
  // Generate a short name from the model ID
  // e.g., "microsoft/DialoGPT-medium" -> "dialogpt-medium"
  // e.g., "anthropic/claude-3.5-sonnet" -> "claude-3.5-sonnet"
  const parts = modelId.split('/');
  const modelName = parts[parts.length - 1] || modelId;
  return modelName.toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
}

function extractMaxTokens(huggingFaceData: any): number | undefined {
  // Try to extract max tokens from various sources
  if (huggingFaceData.cardData?.max_position_embeddings) {
    return huggingFaceData.cardData.max_position_embeddings;
  }

  if (huggingFaceData.config?.max_position_embeddings) {
    return huggingFaceData.config.max_position_embeddings;
  }

  // Check for common context length indicators in model card
  const description = (huggingFaceData.cardData?.description || huggingFaceData.description || '').toLowerCase();
  const contextMatch = description.match(/(\d+)k?\s*context|context.*?(\d+)k?|(\d+)k?\s*tokens/i);
  if (contextMatch) {
    const num = parseInt(contextMatch[1] || contextMatch[2] || contextMatch[3]);
    return num > 100 ? num : num * 1000; // Convert k to actual number if needed
  }

  return undefined;
}

function extractQuantizationType(filename: string): string {
  // Extract quantization type from GGUF filename
  // Updated pattern to handle newer GGUF quantization formats including IQ2_M, Q2_K_XL, etc.
  const match = filename.match(/[.-](Q\d+_[KM](?:_[XLMS]+)?|F16|F32|Q\d+_\d+|IQ\d+_[MNXSL]+)(?:[.-]|\.gguf)/i);
  return match?.[1]?.toUpperCase() || 'UNKNOWN';
}

function formatFileSize(bytes: number): string {
  if (!bytes) return 'Unknown';

  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  if (i === 0) return bytes + ' ' + sizes[i];
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function generateModelId(modelInfo: ModelInfo): string {
  // Generate a unique ID for the model
  const baseId = `${modelInfo.provider}-${modelInfo.modelShortName}`;
  return baseId.replace(/[^a-z0-9-]/g, '-').toLowerCase();
}

function validateModelEntry(modelInfo: ModelInfo): ValidationResult {
  const issues: Array<{ message: string; severity: string }> = [];

  if (!modelInfo.name || modelInfo.name.trim().length === 0) {
    issues.push({ message: 'Model name is required', severity: 'error' });
  }

  if (!modelInfo.modelShortName || modelInfo.modelShortName.trim().length === 0) {
    issues.push({ message: 'Model short name is required', severity: 'error' });
  }

  if (!modelInfo.provider || modelInfo.provider.trim().length === 0) {
    issues.push({ message: 'Provider is required', severity: 'error' });
  }

  if (!modelInfo.contexts || modelInfo.contexts.length === 0) {
    issues.push({ message: 'At least one context must be specified', severity: 'error' });
  }

  if (modelInfo.maxTokens !== undefined && (isNaN(modelInfo.maxTokens) || modelInfo.maxTokens <= 0)) {
    issues.push({ message: 'Max tokens must be a positive number', severity: 'error' });
  }

  return {
    valid: issues.filter(issue => issue.severity === 'error').length === 0,
    issues
  };
}