/**
 * Engine subcommand registration
 *
 * Commands for managing the llama-cpp inference engine.
 * Uses selection.json to determine which models to load.
 */

import { Command } from 'commander';
import { doctorCommand } from './doctor.js';
import { statusCommand } from './status.js';
import { upCommand } from './up.js';
import { downCommand } from './down.js';
import { logsCommand } from './logs.js';
import { pullCommand } from './pull.js';

export function registerEngineCommands(program: Command): void {
  const engine = new Command('engine')
    .description('Manage llama-cpp inference engine')
    .alias('e')
    .action(() => {
      engine.help();
    });

  engine
    .command('doctor')
    .description('Check system readiness for running local models')
    .action(doctorCommand);

  engine
    .command('status')
    .description('Show llama-cpp engine status')
    .option('--json', 'Output as JSON')
    .action(statusCommand);

  engine
    .command('up')
    .description('Start llama-cpp engine with models from selection.json')
    .option('--foreground', 'Run in foreground (do not daemonize)')
    .option('--force', 'Start even if memory check warns of insufficient VRAM')
    .action((options) => upCommand(options));

  engine
    .command('down')
    .description('Stop llama-cpp engine')
    .option('--force', 'Force kill (SIGKILL instead of SIGTERM)')
    .action((options) => downCommand(options));

  engine
    .command('logs')
    .description('View llama-cpp engine logs')
    .option('-n, --lines <n>', 'Number of lines to show', '50')
    .option('-f, --follow', 'Follow log output in real-time')
    .action(logsCommand);

  engine
    .command('pull <model-ref>')
    .description('Download a model from HuggingFace (format: org/repo/filename.gguf)')
    .option('--model-id <id>', 'Model ID to update with local path after download')
    .action(pullCommand);

  program.addCommand(engine);
}
