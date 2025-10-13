import chalk from 'chalk';

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

  // Providers
  provider: {
    proxy: chalk.magenta,
    llamacpp: chalk.blue,
    ollama: chalk.yellow, // Changed from orange to yellow since chalk doesn't have orange
    'lm-studio': chalk.cyan,
    'mlx-lm': chalk.yellow,
    'mlx-vlm': chalk.yellow,
    openrouter: chalk.magenta
  } as Record<string, ChalkFunction>
};

// Status icons
export const icons = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  question: '❓',

  active: '🟢',
  inactive: '⚪',
  enabled: '🟦',
  disabled: '⏸️',

  loading: '⏳',
  rocket: '🚀',
  robot: '🤖',
  gear: '⚙️',
  link: '🔗',
  download: '⬇️',
  import: '📥'
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

export function truncateString(str: string | undefined, maxLength: number = 30): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

export function formatMLX(isMLX: boolean): string {
  if (isMLX) {
    return chalk.yellow.bold('MLX');
  } else {
    return colors.dim('—');
  }
}

export function printProviderReminder(provider: string, contexts: string[]): void {
  // Only show reminder for local providers (not openrouter or proxy)
  if (provider === 'openrouter' || provider === 'proxy') {
    return;
  }

  console.log(colors.subheader(`\n${icons.info} Provider Setup Reminder:`));
  console.log(colors.warning(`- Make sure to download the model for ${colors.emphasis(provider)}`));
  console.log(colors.info('- Ensure the provider is running on the correct port:'));

  if (contexts.includes('backend')) {
    console.log(colors.dim('  - Backend: port 11434 (default)'));
  }
  if (contexts.includes('workers')) {
    console.log(colors.dim('  - Workers: port 11435 (default)'));
  }

  console.log(colors.dim('\nFor more info checkout the README at:'));
  console.log(colors.dim('https://github.com/eclaire-labs/eclaire#selecting-models'));
}