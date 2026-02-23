/**
 * Engine doctor command
 *
 * Checks system readiness for running local LLM models.
 */

import chalk from "chalk";
import { runDoctorChecks } from "../../engine/health.js";
import type { DoctorCheck } from "../../types/engines.js";
import { colors, icons } from "../../ui/colors.js";

export async function doctorCommand(): Promise<void> {
  console.log(colors.header(`\n${icons.gear} Engine Health Check\n`));

  try {
    const checks = await runDoctorChecks();

    // Display results
    for (const check of checks) {
      printCheck(check);
    }

    // Summary
    const passed = checks.filter((c) => c.status === "pass").length;
    const warnings = checks.filter((c) => c.status === "warn").length;
    const failed = checks.filter((c) => c.status === "fail").length;

    console.log("");
    console.log(colors.subheader("Summary:"));
    console.log(
      `  ${colors.success(`${passed} passed`)}, ` +
        `${warnings > 0 ? colors.warning(`${warnings} warnings`) : colors.dim(`${warnings} warnings`)}, ` +
        `${failed > 0 ? colors.error(`${failed} failed`) : colors.dim(`${failed} failed`)}`,
    );
    console.log("");

    // Exit with error code if any checks failed
    if (failed > 0) {
      process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(colors.error(`${icons.error} Doctor check failed: ${message}`));
    process.exit(1);
  }
}

function printCheck(check: DoctorCheck): void {
  const statusIcon = getStatusIcon(check.status);
  const statusColor = getStatusColor(check.status);

  console.log(`  ${statusIcon} ${statusColor(check.name)}`);
  console.log(`     ${colors.dim(check.message)}`);

  if (check.fix) {
    console.log(`     ${colors.warning("Fix:")} ${check.fix}`);
  }
}

function getStatusIcon(status: "pass" | "warn" | "fail"): string {
  switch (status) {
    case "pass":
      return chalk.green("PASS");
    case "warn":
      return chalk.yellow("WARN");
    case "fail":
      return chalk.red("FAIL");
  }
}

function getStatusColor(status: "pass" | "warn" | "fail"): typeof chalk {
  switch (status) {
    case "pass":
      return chalk.green;
    case "warn":
      return chalk.yellow;
    case "fail":
      return chalk.red;
  }
}
