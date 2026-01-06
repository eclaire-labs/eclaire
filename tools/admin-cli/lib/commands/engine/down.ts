/**
 * Engine down command
 *
 * Stops the llama-cpp engine.
 */

import ora from "ora";
import {
  getServerStatus,
  resolveSelectionEngine,
  stopLlamaServer,
} from "../../engine/process.js";
import { colors, icons } from "../../ui/colors.js";

interface DownOptions {
  force?: boolean;
}

export async function downCommand(options: DownOptions = {}): Promise<void> {
  try {
    // Get provider config for port info (optional)
    const resolution = resolveSelectionEngine();
    const status = getServerStatus(resolution.providerConfig);

    if (!status.running) {
      console.log(colors.info(`${icons.info} llama-cpp engine is not running`));
      return;
    }

    console.log(colors.header(`\n${icons.gear} Stopping llama-cpp Engine\n`));

    const spinner = ora({
      text: `Stopping llama-server (PID: ${status.pid})...`,
      color: "cyan",
    }).start();

    try {
      await stopLlamaServer(options.force ?? false);
      spinner.succeed(
        `llama-cpp engine stopped${options.force ? " (forced)" : ""}`,
      );
    } catch (error: any) {
      // Handle the case where process wasn't running but had stale PID file
      if (error.message.includes("Cleaned up stale PID file")) {
        spinner.warn(error.message);
        return;
      }
      spinner.fail(`Failed to stop engine: ${error.message}`);
      process.exit(1);
    }

    console.log("");
  } catch (error: any) {
    console.log(
      colors.error(`${icons.error} Failed to stop engine: ${error.message}`),
    );
    process.exit(1);
  }
}
