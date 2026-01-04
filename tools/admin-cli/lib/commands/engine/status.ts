/**
 * Engine status command
 *
 * Shows the status of the llama-cpp engine.
 */

import { colors, icons } from '../../ui/colors.js';
import {
  getServerStatus,
  resolveSelectionEngine,
  getEngineSettings,
} from '../../engine/process.js';
import { checkServerHealth } from '../../engine/health.js';
import type { CommandOptions } from '../../types/index.js';

export async function statusCommand(options: CommandOptions): Promise<void> {
  try {
    const resolution = resolveSelectionEngine();
    const engineStatus = getServerStatus(resolution.providerConfig);

    // Get port from provider config
    const port = resolution.providerConfig
      ? getEngineSettings(resolution.providerConfig).port
      : null;

    // Check health if running
    let healthy = false;
    if (engineStatus.running && port) {
      healthy = await checkServerHealth(port);
    }

    // JSON output
    if (options.json) {
      console.log(JSON.stringify({
        engine: 'llama-cpp',
        port,
        running: engineStatus.running,
        pid: engineStatus.pid,
        healthy,
        modelsConfigured: resolution.modelsToPreload.map(m => ({
          context: m.context,
          modelId: m.modelId,
          providerModel: m.providerModel,
        })),
        status: resolution.status,
        message: resolution.message,
      }, null, 2));
      return;
    }

    // Text output
    console.log(colors.header(`\n${icons.server} llama-cpp Engine Status\n`));

    const statusLine = engineStatus.running
      ? colors.success(`${icons.active} Running (PID: ${engineStatus.pid})`)
      : colors.dim(`${icons.inactive} Stopped`);

    const healthLine = engineStatus.running
      ? (healthy ? colors.success(`${icons.success} Healthy`) : colors.warning(`${icons.warning} Unhealthy`))
      : colors.dim('-');

    console.log(`  Engine:  llama-cpp`);
    if (port) {
      console.log(`  Port:    ${port}`);
    }
    console.log(`  Status:  ${statusLine}`);
    console.log(`  Health:  ${healthLine}`);
    console.log('');

    // Show models from selection.json
    if (resolution.modelsToPreload.length > 0) {
      console.log(colors.subheader('  Models from selection.json:'));
      for (const m of resolution.modelsToPreload) {
        console.log(`    ${colors.info(m.context)}: ${m.modelId}`);
        console.log(colors.dim(`             ${m.providerModel}`));
      }
      console.log('');
    } else if (resolution.status === 'no-managed') {
      console.log(colors.dim('  No managed llama-cpp models in selection.json'));
      console.log('');
    } else if (resolution.status === 'conflict') {
      console.log(colors.error(`  ${icons.error} ${resolution.message}`));
      console.log('');
    }

    // Helpful commands
    if (!engineStatus.running && resolution.status === 'ok') {
      console.log(colors.dim('Start engine: eclaire engine up'));
    } else if (engineStatus.running) {
      console.log(colors.dim('Stop engine:  eclaire engine down'));
      console.log(colors.dim('View logs:    eclaire engine logs'));
    }

    console.log('');
  } catch (error: any) {
    console.log(colors.error(`${icons.error} Failed to get status: ${error.message}`));
    process.exit(1);
  }
}
