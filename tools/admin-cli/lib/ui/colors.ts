import chalk from 'chalk';
import { isModelSuitableForBackend, isModelSuitableForWorkers } from '../config/models.js';
import type { Model } from '../types/index.js';

type ChalkFunction = typeof chalk;

// Color scheme for different elements
export const colors = {
  // Status colors
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.blue,

  // UI elements
  header: chalk.cyan.bold,
  subheader: chalk.cyan,
  emphasis: chalk.bold,
  dim: chalk.gray,

  // Model status
  active: chalk.green,
  inactive: chalk.gray,
  enabled: chalk.blue,
  disabled: chalk.red,

  // Providers (by engine)
  provider: {
    proxy: chalk.magenta,
    'llama-cpp': chalk.blue,
    llamacpp: chalk.blue,
    ollama: chalk.yellow,
    'lm-studio': chalk.cyan,
    'mlx-lm': chalk.yellow,
    'mlx-vlm': chalk.yellow,
    openrouter: chalk.magenta
  } as Record<string, ChalkFunction>
};

// Status icons
export const icons = {
  success: '\u2705',
  error: '\u274C',
  warning: '\u26A0\uFE0F',
  info: '\u2139\uFE0F',
  question: '\u2753',

  active: '\uD83D\uDFE2',
  inactive: '\u26AA',
  enabled: '\uD83D\uDFE6',
  disabled: '\u23F8\uFE0F',

  loading: '\u23F3',
  rocket: '\uD83D\uDE80',
  robot: '\uD83E\uDD16',
  gear: '\u2699\uFE0F',
  link: '\uD83D\uDD17',
  download: '\u2B07\uFE0F',
  import: '\uD83D\uDCE5',
  plug: '\uD83D\uDD0C',
  cloud: '\u2601\uFE0F',
  server: '\uD83D\uDDA5\uFE0F'
};

// Helper functions
export function formatStatus(isActive: boolean = false): string {
  if (isActive) {
    return colors.active(`${icons.active} ACTIVE`);
  } else {
    return colors.inactive(`${icons.inactive} INACTIVE`);
  }
}

export function formatProvider(provider: string): string {
  const colorFn = colors.provider[provider] || chalk.white;
  return colorFn(provider);
}

export function formatEngine(engine: { name: string; managed?: boolean } | undefined): string {
  if (!engine) return colors.dim('-');
  const colorFn = colors.provider[engine.name] || chalk.white;
  const managedIndicator = engine.managed ? ' (managed)' : '';
  return colorFn(engine.name) + colors.dim(managedIndicator);
}

export function formatContext(contexts: string[] | undefined): string {
  if (!contexts || contexts.length === 0) return colors.dim('none');

  return contexts.map((ctx: string) => {
    switch (ctx) {
      case 'backend': return chalk.blue(ctx);
      case 'workers': return chalk.green(ctx);
      default: return chalk.white(ctx);
    }
  }).join(colors.dim(', '));
}

export function formatSuitability(model: Model): string {
  const contexts: string[] = [];
  if (isModelSuitableForBackend(model)) contexts.push('backend');
  if (isModelSuitableForWorkers(model)) contexts.push('workers');
  return formatContext(contexts);
}

export function truncateString(str: string | undefined, maxLength: number = 30): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

export function formatMLX(isMLX: boolean): string {
  if (isMLX) {
    return chalk.yellow.bold('MLX');
  } else {
    return colors.dim('-');
  }
}

export function formatAuthType(authType: string): string {
  switch (authType) {
    case 'none': return colors.dim('none');
    case 'bearer': return chalk.green('bearer');
    case 'api-key-header': return chalk.blue('api-key');
    default: return chalk.white(authType);
  }
}

export function formatDialect(dialect: string): string {
  switch (dialect) {
    case 'openai-chat': return chalk.blue('openai-chat');
    case 'mlx-responses': return chalk.yellow('mlx-responses');
    default: return chalk.white(dialect);
  }
}

export function printProviderReminder(provider: string, contexts: string[]): void {
  // Only show reminder for local providers (not openrouter or proxy)
  if (provider === 'openrouter' || provider === 'proxy') {
    return;
  }

  console.log(colors.subheader(`\n${icons.info} Provider Setup Reminder:`));
  console.log(colors.warning(`- Make sure to download the model for ${colors.emphasis(provider)}`));

  if (provider === 'llama-cpp') {
    console.log(colors.info('- Start the engine with: eclaire engine up'));
    console.log(colors.dim('  The engine port is configured in providers.json'));
  } else {
    console.log(colors.info('- Ensure the provider is running'));
  }

  console.log(colors.dim('\nFor more info checkout the README at:'));
  console.log(colors.dim('https://github.com/eclaire-labs/eclaire#selecting-models'));
}
