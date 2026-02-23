#!/usr/bin/env node

import path from "node:path";
import { type AILogger, setConfigPath, setLoggerFactory } from "@eclaire/ai";
import boxen from "boxen";
import chalk from "chalk";
import { Command } from "commander";
import { registerConfigCommands } from "./lib/commands/config/index.js";
import { registerEngineCommands } from "./lib/commands/engine/index.js";
import { registerModelCommands } from "./lib/commands/model/index.js";
// Import subcommand registrations
import { registerProviderCommands } from "./lib/commands/provider/index.js";
import { setConfigDir } from "./lib/config/models.js";

// Logger factories for --verbose flag
const silentLogger: AILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const createVerboseLogger = (name: string): AILogger => ({
  debug: (obj, msg) => console.debug(`[${name}] ${msg || ""}`, obj),
  info: (obj, msg) => console.info(`[${name}] ${msg || ""}`, obj),
  warn: (obj, msg) => console.warn(`[${name}] ${msg || ""}`, obj),
  error: (obj, msg) => console.error(`[${name}] ${msg || ""}`, obj),
});

/**
 * Get default config directory from environment or relative path
 */
function getDefaultConfigDir(): string {
  const configDir = process.env.CONFIG_DIR;
  if (configDir) {
    return path.join(configDir, "ai");
  }
  // From main.ts go up 2 levels to reach the repo root: admin-cli/ -> tools/ -> root/
  return path.join(import.meta.dirname, "..", "..", "config", "ai");
}

const program = new Command();

// CLI Header
console.log(
  boxen(chalk.cyan.bold("Eclaire Admin CLI"), {
    padding: 1,
    margin: 1,
    borderStyle: "round",
    borderColor: "cyan",
  }),
);

program
  .name("eclaire")
  .description(
    "Eclaire Admin CLI - Manage providers, models, and configuration",
  )
  .version("1.0.0")
  .option("-c, --config <path>", "Path to config/ai directory")
  .option("-v, --verbose", "Enable verbose output (debug logging)");

// Register subcommand groups
registerProviderCommands(program);
registerModelCommands(program);
registerConfigCommands(program);

// Only register engine commands if not in container
// (engine runs on host, not accessible from container)
if (process.env.ECLAIRE_RUNTIME !== "container") {
  registerEngineCommands(program);
}

// Hook to handle global options before command execution
program.hook("preAction", (thisCommand) => {
  const options = thisCommand.opts();

  // Set up logger factory based on verbose flag (must be done before config loads)
  const loggerFactory = options.verbose
    ? createVerboseLogger
    : () => silentLogger;
  setLoggerFactory(loggerFactory);

  // Set config path
  if (options.config) {
    setConfigDir(options.config);
  } else {
    setConfigPath(getDefaultConfigDir());
  }
});

// Error handling
program.exitOverride((err) => {
  if (err.code === "commander.unknownCommand") {
    console.log(chalk.red("\n  Unknown command"));
    console.log(
      chalk.gray("  Run") +
        chalk.cyan(" eclaire --help ") +
        chalk.gray("to see available commands\n"),
    );
    process.exit(1);
  }
  if (err.code === "commander.helpDisplayed" || err.code === "commander.help") {
    process.exit(0);
  }
  if (err.code === "commander.version") {
    process.exit(0);
  }
  throw err;
});

// Parse command line arguments
program.parse();
