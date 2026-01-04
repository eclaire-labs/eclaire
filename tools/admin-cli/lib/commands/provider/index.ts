/**
 * Provider subcommand registration
 */

import { Command } from 'commander';
import { listCommand } from './list.js';
import { addCommand } from './add.js';
import { editCommand } from './edit.js';
import { removeCommand } from './remove.js';
import { testCommand } from './test.js';

export function registerProviderCommands(program: Command): void {
  const provider = new Command('provider')
    .description('Manage AI providers')
    .alias('prov')
    .action(() => {
      provider.help();
    });

  provider
    .command('list')
    .alias('ls')
    .description('List all configured providers')
    .option('--json', 'Output as JSON')
    .action(listCommand);

  provider
    .command('add')
    .description('Add a new provider')
    .option('--preset <name>', 'Use a preset configuration')
    .action(addCommand);

  provider
    .command('edit <id>')
    .description('Edit an existing provider')
    .action(editCommand);

  provider
    .command('remove <id>')
    .alias('rm')
    .description('Remove a provider')
    .option('--force', 'Skip confirmation prompt')
    .action(removeCommand);

  provider
    .command('test <id>')
    .description('Test provider connectivity')
    .option('--timeout <ms>', 'Request timeout in milliseconds', '5000')
    .action(testCommand);

  program.addCommand(provider);
}
