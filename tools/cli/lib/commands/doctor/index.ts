import type { Command } from "commander";
import chalk from "chalk";
import {
  intro,
  outro,
  cancel,
  log,
  spinner,
  isCancelled,
} from "../../ui/clack.js";
import {
  backendFetch,
  runOnboardingHealthCheck,
} from "../../backend-client.js";
import { icons } from "../../ui/colors.js";

async function doctorCommand() {
  try {
    intro(chalk.cyan.bold("Eclaire Doctor"));

    const s = spinner();

    // Check backend reachability
    s.start("Checking backend...");
    let backendOk = false;
    try {
      const res = await backendFetch("/health");
      backendOk = res.ok;
      if (backendOk) {
        const info = (await res.json()) as {
          version?: string;
          uptime?: number;
        };
        s.stop("Backend reachable");
        log.info(
          `${icons.success} Backend: v${info.version ?? "unknown"}, uptime ${Math.round((info.uptime ?? 0) / 60)}m`,
        );
      } else {
        s.stop("Backend unreachable");
        log.error(`${icons.error} Backend: HTTP ${res.status}`);
      }
    } catch (error) {
      s.stop("Backend unreachable");
      log.error(
        `${icons.error} Backend: ${error instanceof Error ? error.message : "connection failed"}`,
      );
      log.info(
        "Make sure the backend is running:\n  Docker: docker compose up -d\n  Dev:    pnpm dev",
      );
      outro("Doctor complete (backend unavailable)");
      return;
    }

    // Run onboarding health checks
    s.start("Running health checks...");
    try {
      const health = await runOnboardingHealthCheck();
      s.stop("Health checks complete");

      // Database
      if (health.db.ok) {
        log.info(`${icons.success} Database: connected`);
      } else {
        log.error(
          `${icons.error} Database: ${health.db.error ?? "unreachable"}`,
        );
      }

      // Docling
      if (health.docling.ok) {
        log.info(`${icons.success} Docling: connected`);
      } else {
        log.warn(
          `${icons.warning} Docling: ${health.docling.error ?? "unreachable"} (optional)`,
        );
      }

      // Providers
      if (health.providers.length === 0) {
        log.warn(`${icons.warning} No AI providers configured`);
      } else {
        for (const p of health.providers) {
          if (p.ok) {
            log.info(`${icons.success} Provider ${p.name}: connected`);
          } else {
            log.error(
              `${icons.error} Provider ${p.name}: ${p.error ?? "unreachable"}`,
            );
          }
        }
      }

      // Model selections
      if (health.modelSelections.backend) {
        log.info(
          `${icons.success} Backend model: ${health.modelSelections.backend}`,
        );
      } else {
        log.warn(`${icons.warning} No backend model selected`);
      }
      if (health.modelSelections.workers) {
        log.info(
          `${icons.success} Workers model: ${health.modelSelections.workers}`,
        );
      } else {
        log.warn(`${icons.warning} No workers model selected`);
      }

      // Summary
      const allOk =
        health.db.ok &&
        health.providers.length > 0 &&
        health.providers.every((p) => p.ok) &&
        !!health.modelSelections.backend;

      outro(
        allOk
          ? `${icons.success} All checks passed`
          : `${icons.warning} Some checks need attention`,
      );
    } catch (error) {
      s.stop("Health check failed");
      log.error(
        `Failed to run health checks: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      outro("Doctor complete (with errors)");
    }
  } catch (error) {
    if (isCancelled(error)) {
      cancel("Cancelled");
      return;
    }
    throw error;
  }
}

export function registerDoctorCommands(program: Command): void {
  program
    .command("doctor")
    .description("Check system health and configuration")
    .action(doctorCommand);
}
