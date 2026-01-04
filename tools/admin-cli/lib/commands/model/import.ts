import axios from 'axios';
import ora from 'ora';
import inquirer from 'inquirer';
import { addModel, getProviders, isModelSuitableForBackend, isModelSuitableForWorkers } from '../../config/models.js';
import { colors, icons, printProviderReminder } from '../../ui/colors.js';
import { promptProviderSelection } from '../../ui/prompts.js';
import { estimateModelMemory, formatMemorySize } from '../../engine/memory.js';
import type { CommandOptions, Model, InputModality } from '../../types/index.js';

interface ModelArchitectureInfo {
  layers?: number;
  kvHeads?: number;
  headDim?: number;
  maxPositionEmbeddings?: number;
  slidingWindow?: number;
  slidingWindowPattern?: number;
}

interface ModelInfo {
  name: string;
  apiModelId: string;
  url?: string;
  maxTokens?: number;
  pipeline_tag?: string;
  isGGUF?: boolean;
  quantizations?: QuantizationInfo[];
  selectedQuantization?: QuantizationInfo;
  fileSize?: number;
  architecture?: any;
  modelArchitecture?: ModelArchitectureInfo; // For VRAM estimation
  hasVision?: boolean;
  visionSizeBytes?: number; // Size of mmproj file for vision models
  tags?: string[];
  // Capability detection (from OpenRouter supported_parameters or defaults)
  supportsTools?: boolean;
  supportsJsonSchema?: boolean;
}

interface QuantizationInfo {
  filename: string;
  size: number;
  quantization: string;
  sizeFormatted: string;
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
    console.log(`Name: ${modelInfo.name}`);
    console.log(`API Model ID: ${modelInfo.apiModelId}`);
    console.log(`Vision: ${modelInfo.hasVision ? 'Detected' : 'Not Detected'}`);
    if (modelInfo.maxTokens) {
      console.log(`Context Window: ${modelInfo.maxTokens.toLocaleString()} tokens`);
    }

    // Show quantization options for GGUF models and prompt for selection
    if (modelInfo.isGGUF && modelInfo.quantizations && modelInfo.quantizations.length > 0) {
      console.log(colors.subheader('\nAvailable Quantizations:'));
      console.log(colors.dim('These are the different compressed versions available:'));

      // Check if we can show memory estimates (need architecture with required fields)
      const arch = modelInfo.modelArchitecture;
      const canEstimateMemory = arch?.layers && arch?.kvHeads && modelInfo.maxTokens;

      const Table = (await import('cli-table3')).default;
      const headers = [colors.header('Quantization'), colors.header('File Size')];
      const colWidths = [15, 13];

      if (canEstimateMemory) {
        headers.push(colors.header('Est. Memory'));
        colWidths.push(14);
      }
      headers.push(colors.header('Filename'));
      colWidths.push(canEstimateMemory ? 30 : 35);

      const quantTable = new Table({
        head: headers,
        colWidths,
        style: { head: [], border: ['gray'] }
      });

      // Helper to calculate memory estimate for a quant
      const getMemoryEstimate = (size: number): string => {
        if (!canEstimateMemory || !arch) return '-';
        const estimate = estimateModelMemory(
          size,
          modelInfo.maxTokens!,
          {
            layers: arch.layers!,
            kvHeads: arch.kvHeads!,
            headDim: arch.headDim,
            slidingWindow: arch.slidingWindow,
            slidingWindowPattern: arch.slidingWindowPattern,
          },
          modelInfo.visionSizeBytes
        );
        return `~${formatMemorySize(estimate.total)}`;
      };

      modelInfo.quantizations.slice(0, 10).forEach(q => {
        const row = [
          colors.emphasis(q.quantization),
          q.sizeFormatted,
        ];
        if (canEstimateMemory) {
          row.push(getMemoryEstimate(q.size));
        }
        row.push(colors.dim(q.filename));
        quantTable.push(row);
      });

      console.log(quantTable.toString());
      if (modelInfo.quantizations.length > 10) {
        console.log(colors.dim(`... and ${modelInfo.quantizations.length - 10} more quantizations`));
      }
      if (canEstimateMemory) {
        console.log(colors.dim(`Memory estimates at ${modelInfo.maxTokens!.toLocaleString()} context`));
      }

      // Prompt user to select quantization
      const quantChoice = await inquirer.prompt([{
        type: 'select',
        name: 'selectedQuantization',
        message: 'Select quantization (affects model size and quality):',
        choices: modelInfo.quantizations.map(q => {
          const memInfo = canEstimateMemory ? ` | ${getMemoryEstimate(q.size)}` : '';
          return {
            name: `${q.quantization} (${q.sizeFormatted}${memInfo}) - ${q.filename}`,
            value: q,
            short: q.quantization
          };
        }),
        default: 0
      }]);

      modelInfo.selectedQuantization = quantChoice.selectedQuantization;
      modelInfo.fileSize = quantChoice.selectedQuantization.size;
    }

    // Get available providers
    const providers = getProviders();
    const providerIds = Object.keys(providers);

    if (providerIds.length === 0) {
      console.log(colors.error(`${icons.error} No providers configured in providers.json`));
      console.log(colors.dim('Add at least one provider before importing models'));
      console.log(colors.dim('Run: eclaire provider add'));
      process.exit(1);
    }

    // Provider selection
    let selectedProvider: string;
    if (options.provider && providerIds.includes(options.provider)) {
      selectedProvider = options.provider;
    } else {
      // Suggest appropriate providers based on source
      let suggestedProviders: string[];
      if (urlType === 'openrouter') {
        suggestedProviders = providerIds.filter(p => p === 'openrouter' || p === 'proxy');
      } else if (modelInfo.isGGUF) {
        suggestedProviders = providerIds.filter(p =>
          p === 'llamacpp' || p === 'ollama' || p === 'lm-studio' || p.includes('mlx')
        );
      } else {
        suggestedProviders = providerIds;
      }

      // If we have suggested providers, show them first
      const orderedProviders = [
        ...suggestedProviders,
        ...providerIds.filter(p => !suggestedProviders.includes(p))
      ];

      selectedProvider = await promptProviderSelection(
        orderedProviders,
        'Select provider for this model:'
      );

      // Warn if user selects mlx-lm for a vision model
      if (selectedProvider === 'mlx-lm' && modelInfo.hasVision) {
        console.log(colors.warning(`\n${icons.warning} Warning: mlx-lm only supports text models.`));
        console.log(colors.dim('For vision support, consider using mlx-vlm instead.'));

        const confirmMLXLM = await inquirer.prompt([{
          type: 'confirm',
          name: 'continue',
          message: 'Continue with mlx-lm anyway?',
          default: false
        }]);

        if (!confirmMLXLM.continue) {
          console.log(colors.dim('Import cancelled'));
          process.exit(0);
        }
      }
    }

    // Generate model ID in provider:model format
    let modelId = generateModelId(selectedProvider, modelInfo.name, modelInfo.selectedQuantization?.quantization);

    // Interactive configuration
    if (options.interactive !== false) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'modelId',
          message: 'Model ID (unique identifier):',
          default: modelId,
          validate: (input: string) => input.trim().length > 0 || 'Model ID is required'
        }
      ]);

      modelId = answers.modelId;
    }

    // Build the new schema model object
    // Suitability is derived from modalities:
    // - Backend: requires text input
    // - Workers: requires text + image input
    const inputModalities: InputModality[] = ['text'];
    if (modelInfo.hasVision) {
      inputModalities.push('image');
    }

    const model: Model = {
      name: modelInfo.selectedQuantization
        ? `${modelInfo.name}:${modelInfo.selectedQuantization.quantization}`
        : modelInfo.name,
      provider: selectedProvider,
      providerModel: modelInfo.apiModelId,
      capabilities: {
        modalities: {
          input: inputModalities,
          output: ['text']
        },
        streaming: true,
        // Default to true since most modern models support tools
        // OpenRouter detection overrides this when info is available
        tools: modelInfo.supportsTools ?? true,
        jsonSchema: modelInfo.supportsJsonSchema ?? false,
        structuredOutputs: false,
        reasoning: { supported: false },
        contextWindow: modelInfo.maxTokens || 8192
      },
      source: {
        url: modelInfo.url || url,
        format: modelInfo.isGGUF ? 'gguf' : undefined,
        quantization: modelInfo.selectedQuantization?.quantization,
        sizeBytes: modelInfo.fileSize,
        visionSizeBytes: modelInfo.visionSizeBytes,
        architecture: modelInfo.modelArchitecture ? {
          layers: modelInfo.modelArchitecture.layers!,
          kvHeads: modelInfo.modelArchitecture.kvHeads!,
          headDim: modelInfo.modelArchitecture.headDim,
          ...(modelInfo.modelArchitecture.slidingWindow && { slidingWindow: modelInfo.modelArchitecture.slidingWindow }),
          ...(modelInfo.modelArchitecture.slidingWindowPattern && { slidingWindowPattern: modelInfo.modelArchitecture.slidingWindowPattern })
        } : undefined
      },
      pricing: null
    };

    // Derive suitability from modalities for display
    const suitableForBackend = isModelSuitableForBackend(model);
    const suitableForWorkers = isModelSuitableForWorkers(model);

    // Final confirmation before importing
    console.log(colors.subheader('\nImport Summary:'));
    console.log(colors.emphasis(`Model ID: ${modelId}`));
    console.log(`Name: ${model.name}`);
    console.log(`Provider: ${selectedProvider}`);
    console.log(`Provider Model: ${model.providerModel}`);
    console.log(`Suitable for: ${suitableForBackend ? 'backend' : ''}${suitableForBackend && suitableForWorkers ? ', ' : ''}${suitableForWorkers ? 'workers' : ''}`);
    if (modelInfo.selectedQuantization) {
      console.log(`Quantization: ${modelInfo.selectedQuantization.quantization} (${modelInfo.selectedQuantization.sizeFormatted})`);
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

    // Add the model
    console.log(colors.header(`\n${icons.gear} Adding Model...`));

    try {
      addModel(modelId, model);
      console.log(colors.success(`${icons.success} Model '${modelId}' imported successfully!`));
      console.log(colors.dim(`Run 'eclaire model activate ${modelId}' to activate this model`));

      // Show provider setup reminder
      const contexts: string[] = [];
      if (suitableForBackend) contexts.push('backend');
      if (suitableForWorkers) contexts.push('workers');
      printProviderReminder(selectedProvider, contexts);
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

function hasVisionSupport(tags: string[] = [], pipelineTag?: string, architecture?: any): boolean {
  // Check HuggingFace models: look for image-text-to-text tag
  if (tags.includes('image-text-to-text') || pipelineTag === 'image-text-to-text') {
    return true;
  }

  // Check OpenRouter models: look for 'image' in input_modalities
  if (architecture?.input_modalities && Array.isArray(architecture.input_modalities)) {
    return architecture.input_modalities.includes('image');
  }

  return false;
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

/**
 * Try to fetch architecture info from a single HuggingFace model's config.json
 */
async function tryFetchArchitectureFromRepo(modelId: string): Promise<ModelArchitectureInfo | undefined> {
  try {
    const response = await axios.get(`https://huggingface.co/${modelId}/raw/main/config.json`, {
      headers: { 'User-Agent': 'eclaire-cli/1.0.0' },
      timeout: 10000,
      validateStatus: (status) => status >= 200 && status < 300
    });

    const config = response.data as any;

    // For multimodal models, check text_config first (e.g., Gemma 3 vision models)
    const textConfig = config.text_config || config;

    // Extract architecture info from config.json
    // Different models use different field names
    const layers = textConfig.num_hidden_layers || textConfig.n_layer || textConfig.num_layers;
    const kvHeads = textConfig.num_key_value_heads || textConfig.n_head_kv || textConfig.num_kv_heads;
    const numHeads = textConfig.num_attention_heads || textConfig.n_head;
    const hiddenSize = textConfig.hidden_size || textConfig.n_embd;

    // Calculate head_dim if not directly available
    let headDim = textConfig.head_dim;
    if (!headDim && hiddenSize && numHeads) {
      headDim = Math.floor(hiddenSize / numHeads);
    }

    // Extract context and sliding window info
    const maxPositionEmbeddings = textConfig.max_position_embeddings;
    const slidingWindow = textConfig.sliding_window || undefined;
    const slidingWindowPattern = textConfig.sliding_window_pattern || undefined;

    if (layers && kvHeads) {
      return {
        layers,
        kvHeads,
        headDim: headDim || 128, // Default to 128 if not found
        maxPositionEmbeddings,
        slidingWindow,
        slidingWindowPattern,
      };
    }

    return undefined;
  } catch {
    // Config.json might not exist or be accessible
    return undefined;
  }
}

/**
 * Fetch model architecture info from HuggingFace config.json
 * This is needed for accurate VRAM estimation.
 * Falls back to base model if GGUF repo doesn't have config.json.
 */
async function fetchModelArchitecture(
  modelId: string,
  baseModelId?: string
): Promise<ModelArchitectureInfo | undefined> {
  // Try the GGUF repo first
  let result = await tryFetchArchitectureFromRepo(modelId);

  // If failed and base model available, try that
  if (!result && baseModelId) {
    result = await tryFetchArchitectureFromRepo(baseModelId);
  }

  return result;
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
        'User-Agent': 'eclaire-cli/1.0.0'
      },
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300
    });

    const data = response.data as any;

    // Extract base model ID for GGUF repos (used to fetch architecture from source)
    const baseModelId: string | undefined = data.cardData?.base_model;

    // Determine if model has vision support
    const isVisionModel = hasVisionSupport(data.tags, data.pipeline_tag);

    // Extract context length - prefer GGUF metadata, then fall back to other sources
    const ggufContextLength = data.gguf?.context_length;
    const fallbackMaxTokens = extractMaxTokens(data);

    // Extract model information
    let modelInfo: ModelInfo = {
      name: data.modelId || modelId,
      apiModelId: modelId,
      url: `https://huggingface.co/${modelId}`,
      maxTokens: ggufContextLength || fallbackMaxTokens,
      pipeline_tag: data.pipeline_tag,
      isGGUF: false,
      quantizations: [],
      hasVision: isVisionModel,
      tags: data.tags || []
    };

    // Check if this is a GGUF repository by looking for .gguf files
    if (modelId.toLowerCase().includes('gguf') || data.tags?.includes('gguf')) {
      try {
        const filesResponse = await axios.get(`https://huggingface.co/api/models/${modelId}/tree/main`, {
          headers: { 'User-Agent': 'eclaire-cli/1.0.0' },
          timeout: 10000,
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 300
        });

        const files = (filesResponse.data as any) || [];
        const ggufFiles = files.filter((file: any) =>
          file.path?.endsWith('.gguf') && !file.path?.startsWith('mmproj-')
        );

        if (ggufFiles.length > 0) {
          modelInfo.isGGUF = true;
          modelInfo.quantizations = ggufFiles.map((file: any) => ({
            filename: file.path,
            size: file.size,
            quantization: extractQuantizationType(file.path),
            sizeFormatted: formatFileSize(file.size)
          })).sort((a: QuantizationInfo, b: QuantizationInfo) => a.size - b.size);

          // Detect vision projector (mmproj) files for multimodal models
          // Prefer F16 as it's what llama-server uses by default
          const mmprojFiles = files.filter((file: any) => file.path?.startsWith('mmproj-'));
          if (mmprojFiles.length > 0) {
            const preferredMmproj = mmprojFiles.find((f: any) => f.path === 'mmproj-F16.gguf')
              || mmprojFiles.find((f: any) => f.path === 'mmproj-BF16.gguf')
              || mmprojFiles[0];
            if (preferredMmproj) {
              modelInfo.visionSizeBytes = preferredMmproj.size;
              modelInfo.hasVision = true; // Presence of mmproj confirms vision support
            }
          }

          // Fetch architecture info for GGUF models (important for VRAM estimation)
          // Falls back to base model if GGUF repo doesn't have config.json
          modelInfo.modelArchitecture = await fetchModelArchitecture(modelId, baseModelId);

          // Use architecture's maxPositionEmbeddings as fallback for context window
          if (!modelInfo.maxTokens && modelInfo.modelArchitecture?.maxPositionEmbeddings) {
            modelInfo.maxTokens = modelInfo.modelArchitecture.maxPositionEmbeddings;
          }
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
        'User-Agent': 'eclaire-cli/1.0.0'
      },
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300
    });

    const models = (response.data as any).data;
    const model = models.find((m: any) => m.id === modelId);

    if (!model) {
      throw new Error(`Model '${modelId}' not found on OpenRouter`);
    }

    // Detect vision support from architecture
    const isVisionModel = hasVisionSupport([], undefined, model.architecture);

    // Detect capabilities from supported_parameters
    const supportedParams: string[] = model.supported_parameters || [];
    const supportsTools = supportedParams.includes('tools');
    const supportsJsonSchema = supportedParams.includes('response_format');

    const modelInfo: ModelInfo = {
      name: model.name || modelId,
      apiModelId: modelId,
      url: `https://openrouter.ai/models/${modelId}`,
      maxTokens: typeof model.context_length === 'number' ? model.context_length : undefined,
      architecture: model.architecture,
      hasVision: isVisionModel,
      supportsTools,
      supportsJsonSchema
    };

    return modelInfo;

  } catch (error: any) {
    if (error.response?.status === 404) {
      throw new Error(`OpenRouter API not found or model '${modelId}' doesn't exist`);
    }
    throw new Error(`Failed to fetch OpenRouter model: ${error.message}`);
  }
}

function generateModelId(provider: string, name: string, quantization?: string): string {
  // Generate a unique ID in provider:model format
  let modelPart = name.split('/').pop() || name;
  modelPart = modelPart
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')      // Collapse consecutive dashes
    .replace(/^-|-$/g, '');   // Trim leading/trailing dashes

  if (quantization) {
    // Normalize quantization: Q4_K_XL -> q4-k-xl
    const normalizedQuant = quantization.toLowerCase().replace(/_/g, '-');
    modelPart += `-${normalizedQuant}`;
  }

  return `${provider}:${modelPart}`;
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
    return num > 100 ? num : num * 1000;
  }

  return undefined;
}

function extractQuantizationType(filename: string): string {
  // Extract quantization type from GGUF filename
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
