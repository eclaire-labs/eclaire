import inquirer from 'inquirer';
import { colors, formatProvider, truncateString } from './colors.js';
import { Model, Context } from '../types/index.js';

interface ModelSelection {
  provider: string;
  modelShortName: string;
}

interface ModelImportData {
  modelFullName: string;
  provider: string;
  modelShortName: string;
  description?: string;
}

interface ModelImportConfig extends ModelImportData {
  contexts: string[];
  providerUrl: string;
  apiKey: string | null;
  description: string;
}

interface ModelEditData {
  modelShortName: string;
  provider: string;
  contexts: string[];
  description: string;
}

/**
 * Prompt for context selection
 */
export async function promptContext(
  message: string = 'Select context:',
  availableContexts: string[] | null = null
): Promise<Context> {
  let choices = [
    { name: 'Backend', value: 'backend' as const },
    { name: 'Workers', value: 'workers' as const },
    { name: 'Both', value: 'both' as const }
  ];

  // If specific contexts are provided, filter the choices
  if (availableContexts && Array.isArray(availableContexts)) {
    choices = choices.filter(choice =>
      availableContexts.includes(choice.value) || choice.value === 'both'
    );
    // Remove 'both' option if only one context is available
    if (availableContexts.length === 1) {
      choices = choices.filter(choice => choice.value !== 'both');
    }
  }

  const { context } = await inquirer.prompt([
    {
      type: 'list',
      name: 'context',
      message,
      choices
    }
  ]);

  return context;
}

/**
 * Prompt for model selection from a list
 */
export async function promptModelSelection(
  models: Model[],
  message: string = 'Select a model:'
): Promise<ModelSelection> {
  if (models.length === 0) {
    throw new Error('No models available for selection');
  }

  const choices = models.map(model => ({
    name: `${formatProvider(model.provider)}:${model.modelShortName}${model.description ? colors.dim(` - ${truncateString(model.description, 60)}`) : ''}`,
    value: { provider: model.provider, modelShortName: model.modelShortName },
    short: `${model.provider}:${model.modelShortName}`
  }));

  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message,
      choices,
      pageSize: 10
    }
  ]);

  return selected;
}

/**
 * Prompt for confirmation
 */
export async function promptConfirmation(
  message: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue
    }
  ]);

  return confirmed;
}

/**
 * Prompt for model import configuration
 */
export async function promptModelImport(modelData: ModelImportData): Promise<ModelImportConfig> {
  console.log(colors.header('\n📋 Model Information:'));
  console.log(`Name: ${colors.emphasis(modelData.modelFullName)}`);
  console.log(`Provider: ${formatProvider(modelData.provider)}`);
  console.log(`Short Name: ${colors.emphasis(modelData.modelShortName)}`);
  if (modelData.description) {
    console.log(`Description: ${colors.dim(modelData.description)}`);
  }

  const questions: any[] = [];

  // Context selection
  questions.push({
    type: 'checkbox',
    name: 'contexts',
    message: 'Which contexts should this model support?',
    choices: [
      { name: 'Backend', value: 'backend', checked: true },
      { name: 'Workers', value: 'workers', checked: true }
    ],
    validate: (answer: string[]) => {
      if (answer.length === 0) {
        return 'You must select at least one context';
      }
      return true;
    }
  });

  // Provider URL selection
  questions.push({
    type: 'list',
    name: 'providerUrlVar',
    message: 'Which environment variable should be used for the provider URL?',
    choices: [
      { name: 'AI_LOCAL_PROVIDER_URL (local AI server)', value: '${AI_LOCAL_PROVIDER_URL}' },
      { name: 'AI_PROXY_PROVIDER_URL (proxy/cloud)', value: '${AI_PROXY_PROVIDER_URL}' },
      { name: 'Custom URL', value: 'custom' }
    ]
  });

  // Custom URL input (conditional)
  questions.push({
    type: 'input',
    name: 'customUrl',
    message: 'Enter custom provider URL:',
    when: (answers: any) => answers.providerUrlVar === 'custom',
    validate: (input: string) => {
      if (!input.trim()) return 'URL cannot be empty';
      if (!input.startsWith('http')) return 'URL must start with http:// or https://';
      return true;
    }
  });

  // API Key requirement
  questions.push({
    type: 'list',
    name: 'apiKeyVar',
    message: 'Does this model require an API key?',
    choices: [
      { name: 'No API key needed', value: null },
      { name: 'Use AI_PROXY_API_KEY', value: '${AI_PROXY_API_KEY}' },
      { name: 'Custom environment variable', value: 'custom' }
    ]
  });

  // Custom API key var (conditional)
  questions.push({
    type: 'input',
    name: 'customApiKeyVar',
    message: 'Enter custom API key environment variable name:',
    when: (answers: any) => answers.apiKeyVar === 'custom',
    validate: (input: string) => {
      if (!input.trim()) return 'Variable name cannot be empty';
      return true;
    }
  });

  // Description
  questions.push({
    type: 'input',
    name: 'description',
    message: 'Add a description for this model (optional):'
  });

  const answers = await inquirer.prompt(questions);

  return {
    ...modelData,
    contexts: answers.contexts,
    providerUrl: answers.providerUrlVar === 'custom' ? answers.customUrl : answers.providerUrlVar,
    apiKey: answers.apiKeyVar === 'custom' ? `\${${answers.customApiKeyVar}}` : answers.apiKeyVar,
    description: answers.description || ''
  };
}

/**
 * Prompt for editing model fields
 */
export async function promptEditModel(model: Model): Promise<ModelEditData> {
  const questions: any[] = [
    {
      type: 'input',
      name: 'modelShortName',
      message: 'Model short name:',
      default: model.modelShortName,
      validate: (input: string) => input.trim() ? true : 'Short name cannot be empty'
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      default: model.provider,
      choices: ['llamacpp', 'ollama', 'lm-studio', 'mlx_lm', 'mlx_vlm', 'proxy', 'openrouter']
    },
    {
      type: 'checkbox',
      name: 'contexts',
      message: 'Supported contexts:',
      default: model.contexts || ['backend', 'workers'],
      choices: [
        { name: 'Backend', value: 'backend' },
        { name: 'Workers', value: 'workers' }
      ]
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description:',
      default: model.description || ''
    }
  ];

  const answers = await inquirer.prompt(questions);
  return {
    modelShortName: answers.modelShortName,
    provider: answers.provider,
    contexts: answers.contexts,
    description: answers.description
  };
}