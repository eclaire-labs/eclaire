import type { Command } from "commander";
import chalk from "chalk";
import {
  intro,
  outro,
  log,
  spinner,
  cancel,
  isCancelled,
} from "../../ui/clack.js";
import { backendFetch, fetchOnboardingState } from "../../backend-client.js";
import { icons } from "../../ui/colors.js";

async function statusCommand(opts: { json?: boolean }) {
  try {
    if (!opts.json) {
      intro(chalk.cyan.bold("Eclaire Status"));
    }

    const s = opts.json ? null : spinner();
    s?.start("Fetching instance status...");

    // Health info
    let version = "unknown";
    let uptime = 0;
    let backendOk = false;
    try {
      const res = await backendFetch("/health");
      if (res.ok) {
        const info = (await res.json()) as {
          version?: string;
          uptime?: number;
        };
        version = info.version ?? "unknown";
        uptime = info.uptime ?? 0;
        backendOk = true;
      }
    } catch {
      // Backend not reachable
    }

    // Onboarding state
    const state = await fetchOnboardingState();

    s?.stop("Status retrieved");

    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            backend: { ok: backendOk, version, uptime },
            onboarding: state,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (!backendOk) {
      log.error(`${icons.error} Backend: unreachable`);
      outro("Cannot retrieve full status — backend is not running");
      return;
    }

    // Display status
    log.info(`${icons.info} Version: ${chalk.cyan(version)}`);
    log.info(`${icons.info} Uptime: ${Math.round(uptime / 60)} minutes`);

    if (state) {
      const statusLabel =
        state.status === "completed"
          ? chalk.green("completed")
          : state.status === "in_progress"
            ? chalk.yellow("in progress")
            : chalk.red("not started");
      log.info(`${icons.info} Onboarding: ${statusLabel}`);
      log.info(`${icons.info} Users: ${state.userCount}`);
      log.info(`${icons.info} Admin: ${state.adminExists ? "yes" : "no"}`);
      if (state.selectedPreset) {
        log.info(`${icons.info} Preset: ${chalk.cyan(state.selectedPreset)}`);
      }
      if (state.completedAt) {
        log.info(
          `${icons.info} Setup completed: ${new Date(state.completedAt).toLocaleDateString()}`,
        );
      }
    }

    outro(`${icons.success} Status check complete`);
  } catch (error) {
    if (isCancelled(error)) {
      cancel("Cancelled");
      return;
    }
    throw error;
  }
}

export function registerStatusCommands(program: Command): void {
  program
    .command("status")
    .description("Show instance status and configuration")
    .option("--json", "Output as JSON")
    .action(statusCommand);
}
