#!/usr/bin/env node

import { type AILogger, setInlineConfig, setLoggerFactory } from "@eclaire/ai";
import boxen from "boxen";
import chalk from "chalk";
import { Command } from "commander";
import { registerAgentCommands } from "./lib/commands/agent/index.js";
import { registerApiKeyCommands } from "./lib/commands/api-key/index.js";
import { registerChannelCommands } from "./lib/commands/channel/index.js";
import { registerChatCommand } from "./lib/commands/chat/index.js";
import { registerConfigCommands } from "./lib/commands/config/index.js";
import { registerDoctorCommands } from "./lib/commands/doctor/index.js";
import { registerEngineCommands } from "./lib/commands/engine/index.js";
import { registerMcpCommands } from "./lib/commands/mcp/index.js";
import { registerModelCommands } from "./lib/commands/model/index.js";
import { registerOnboardCommands } from "./lib/commands/onboard/index.js";
import { registerProviderCommands } from "./lib/commands/provider/index.js";
import { registerSettingsCommands } from "./lib/commands/settings/index.js";
import { registerStatusCommands } from "./lib/commands/status/index.js";
import { registerUserCommands } from "./lib/commands/user/index.js";
import { loadAIConfigFromDb } from "./lib/config/models.js";

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

// Suppress banner for chat TUI (it takes over the terminal)
const isChatCommand = process.argv[2] === "chat";

const program = new Command();

if (!isChatCommand) {
  console.log(
    boxen(chalk.cyan.bold("Eclaire CLI"), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "cyan",
    }),
  );
}

program
  .name("eclaire")
  .description(
    "Eclaire CLI - Manage providers, models, channels, and chat with AI",
  )
  .version("1.0.0")
  .option("-v, --verbose", "Enable verbose output (debug logging)");

// Register subcommand groups
registerProviderCommands(program);
registerModelCommands(program);
registerChannelCommands(program);
registerConfigCommands(program);
registerChatCommand(program);
registerMcpCommands(program);
registerSettingsCommands(program);
registerUserCommands(program);
registerAgentCommands(program);
registerApiKeyCommands(program);
registerOnboardCommands(program);
registerDoctorCommands(program);
registerStatusCommands(program);

// Only register engine commands if not in container
// (engine runs on host, not accessible from container)
if (process.env.ECLAIRE_RUNTIME !== "container") {
  registerEngineCommands(program);
}

// Hook to handle global options before command execution
program.hook("preAction", async (thisCommand) => {
  const options = thisCommand.opts();

  // Set up logger factory based on verbose flag (must be done before config loads)
  const loggerFactory = options.verbose
    ? createVerboseLogger
    : () => silentLogger;
  setLoggerFactory(loggerFactory);

  // Load AI config from database into in-memory caches
  try {
    await loadAIConfigFromDb();
  } catch {
    // DB not available — set empty config so commands fail gracefully
    setInlineConfig({
      providers: { providers: {} },
      models: { models: {} },
      selection: { active: {} },
    });
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

// Parse command line arguments (parseAsync so we can exit cleanly after async actions)
await program.parseAsync();
process.exit(0);
