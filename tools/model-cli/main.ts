#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';

// Import commands
import { listCommand } from './lib/commands/list.js';
import { activateCommand } from './lib/commands/activate.js';
import { importCommand } from './lib/commands/import.js';
import { deactivateCommand } from './lib/commands/activate.js';
import { infoCommand } from './lib/commands/info.js';
import { removeCommand } from './lib/commands/remove.js';
import { validateCommand } from './lib/commands/validate.js';
import { setConfigPath } from './lib/config/models.js';

const program = new Command();

// CLI Header
console.log(boxen(
  chalk.cyan.bold('Eclaire AI Model Management CLI'),
  {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  }
));

program
  .name('model-cli')
  .description('Eclaire AI Model Management CLI')
  .version('0.3.0')
  .option('-c, --config <path>', 'Path to models.json configuration file');

// List command
program
  .command('list')
  .alias('ls')
  .description('List all AI models')
  .option('--context <context>', 'Filter by context (backend|workers)')
  .option('--provider <provider>', 'Filter by provider')
  .option('--json', 'Output as JSON')
  .action(listCommand);

// Model information
program
  .command('info <id>')
  .description('Show detailed information about a model')
  .action(infoCommand);

// Active model management
program
  .command('activate [id]')
  .description('Activate a model (set as active for its context)')
  .option('--backend <model>', 'Set backend active model (format: provider:modelShortName)')
  .option('--workers <model>', 'Set workers active model (format: provider:modelShortName)')
  .action(activateCommand);

// Deactivate model
program
  .command('deactivate [context]')
  .description('Deactivate model for a context (remove active assignment)')
  .action(deactivateCommand);

// Import new models
program
  .command('import <url>')
  .description('Import a model from HuggingFace or OpenRouter URL')
  .option('--context <context>', 'Set context (backend|workers|both)', 'both')
  .option('--provider <provider>', 'Force specific provider')
  .option('--no-interactive', 'Skip interactive confirmation')
  .action(importCommand);

// Remove models
program
  .command('remove <id>')
  .alias('rm')
  .description('Remove a model (with confirmation)')
  .option('--force', 'Skip confirmation prompt')
  .action(removeCommand);

// Validate configuration
program
  .command('validate')
  .description('Validate models configuration')
  .option('--fix', 'Attempt to fix issues automatically')
  .action(validateCommand);

// Hook to handle global options before command execution
program.hook('preAction', (thisCommand, actionCommand) => {
  const options = thisCommand.opts();
  if (options.config) {
    setConfigPath(options.config);
  }
});

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.unknownCommand') {
    console.log(chalk.red('✖ Unknown command'));
    console.log(chalk.gray('Run') + chalk.cyan(' model-cli --help ') + chalk.gray('to see available commands'));
    process.exit(1);
  }
  if (err.code === 'commander.helpDisplayed' || err.code === 'commander.help') {
    // Help output is expected, exit gracefully
    process.exit(0);
  }
  throw err;
});

// Parse command line arguments
program.parse();