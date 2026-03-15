/**
 * CLI Client
 *
 * Provides callAICli and callAICliStream — CLI-transport equivalents of
 * the HTTP-based callAI/callAIStream. Used when dialect is "cli_jsonl".
 */

import { interpolateEnvVars } from "../config.js";
import { createLazyLogger, getErrorMessage } from "../logger.js";
import type {
  AICallOptions,
  AIMessage,
  AIResponse,
  AIStreamResponse,
  CliConfig,
  ModelConfig,
  ProviderConfig,
} from "../types.js";
import { createDecoder } from "./decoders/index.js";
import { CliSubprocessRunner } from "./subprocess-runner.js";
import type { CliSpawnConfig } from "./types.js";

const getLogger = createLazyLogger("cli-client");

const DEFAULT_CLI_TIMEOUT = 300_000; // 5 minutes
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 2_000;

// =============================================================================
// PROMPT EXTRACTION
// =============================================================================

/**
 * Extract the prompt string from the messages array.
 * CLI tools take a single prompt, not a message array.
 * We use the last user message as the prompt.
 */
function extractPrompt(messages: AIMessage[]): string {
  // Find the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    if (msg.role === "user") {
      const content = msg.content;
      if (typeof content === "string") return content;
      // Array content — extract text parts
      if (Array.isArray(content)) {
        return content
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("\n");
      }
    }
  }

  // Fallback: concatenate all messages
  return messages
    .map((m) => {
      const content = m.content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((p) => p.type === "text")
          .map((p) => (p as { text: string }).text)
          .join("\n");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

// =============================================================================
// SPAWN CONFIG BUILDING
// =============================================================================

/**
 * Build CLI-provider-specific args from the CliConfig and prompt.
 */
function buildArgs(
  cli: CliConfig,
  prompt: string,
  model: string | undefined,
  sessionId: string | undefined,
): { args: string[]; stdinPayload: string | undefined } {
  const args = [...(cli.staticArgs ?? [])];
  let stdinPayload: string | undefined;

  switch (cli.cliProvider) {
    case "claude": {
      // Claude: claude -p --output-format stream-json --verbose [--resume ID] [--model M] -- "prompt"
      if (sessionId) {
        args.push("--resume", sessionId);
      }
      if (model) {
        args.push("--model", model);
      }
      args.push("--", prompt);
      break;
    }

    case "codex": {
      // Codex: codex [extra_args] exec --json --skip-git-repo-check --color=never [resume ID -] | [-]
      // Model is passed via extra_args from staticArgs
      if (sessionId) {
        // Replace trailing "-" with "resume <id> -"
        const lastIdx = args.lastIndexOf("-");
        if (lastIdx >= 0) {
          args.splice(lastIdx, 1, "resume", sessionId, "-");
        } else {
          args.push("resume", sessionId, "-");
        }
      }
      stdinPayload = prompt;
      break;
    }

    case "opencode": {
      // OpenCode: opencode run --format json [--session ID] [--model M] -- "prompt"
      if (sessionId) {
        args.push("--session", sessionId);
      }
      if (model) {
        args.push("--model", model);
      }
      args.push("--", prompt);
      break;
    }
  }

  return { args, stdinPayload };
}

function buildSpawnConfig(
  cli: CliConfig,
  prompt: string,
  model: string | undefined,
  sessionId: string | undefined,
): CliSpawnConfig {
  const { args, stdinPayload } = buildArgs(cli, prompt, model, sessionId);

  // Interpolate env vars in CLI env config
  let env: Record<string, string> | undefined;
  if (cli.env) {
    env = {};
    for (const [key, value] of Object.entries(cli.env)) {
      env[key] = interpolateEnvVars(value, false);
    }
  }

  return {
    command: cli.command,
    args,
    env,
    stdinPayload,
    timeout: cli.timeout ?? DEFAULT_CLI_TIMEOUT,
    gracefulShutdownMs: cli.gracefulShutdownMs ?? DEFAULT_GRACEFUL_SHUTDOWN_MS,
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Non-streaming CLI call. Spawns the CLI subprocess, collects output, returns AIResponse.
 */
export async function callAICli(
  messages: AIMessage[],
  providerConfig: ProviderConfig,
  modelId: string,
  modelConfig: ModelConfig,
  options: AICallOptions = {},
): Promise<AIResponse> {
  const logger = getLogger();
  const cli = providerConfig.cli;

  if (!cli) {
    throw new Error(
      `Provider "${modelConfig.provider}" uses cli_jsonl dialect but has no "cli" configuration`,
    );
  }

  const prompt = extractPrompt(messages);
  const spawnConfig = buildSpawnConfig(
    cli,
    prompt,
    modelConfig.providerModel !== cli.command
      ? modelConfig.providerModel
      : undefined,
    options.cliSessionId,
  );

  logger.info(
    {
      modelId,
      cliProvider: cli.cliProvider,
      command: cli.command,
      hasSession: !!options.cliSessionId,
    },
    "Making CLI AI call",
  );

  const decoder = createDecoder(cli.cliProvider);
  const runner = new CliSubprocessRunner(decoder);

  const signal =
    options.timeout && options.timeout > 0
      ? AbortSignal.timeout(options.timeout)
      : undefined;

  try {
    return await runner.run(spawnConfig, signal);
  } catch (error) {
    logger.error(
      {
        modelId,
        cliProvider: cli.cliProvider,
        error: getErrorMessage(error),
      },
      "CLI AI call failed",
    );
    throw error;
  }
}

/**
 * Streaming CLI call. Spawns the CLI subprocess, returns an SSE stream.
 */
export async function callAICliStream(
  messages: AIMessage[],
  providerConfig: ProviderConfig,
  modelId: string,
  modelConfig: ModelConfig,
  options: AICallOptions = {},
): Promise<AIStreamResponse> {
  const logger = getLogger();
  const cli = providerConfig.cli;

  if (!cli) {
    throw new Error(
      `Provider "${modelConfig.provider}" uses cli_jsonl dialect but has no "cli" configuration`,
    );
  }

  const prompt = extractPrompt(messages);
  const spawnConfig = buildSpawnConfig(
    cli,
    prompt,
    modelConfig.providerModel !== cli.command
      ? modelConfig.providerModel
      : undefined,
    options.cliSessionId,
  );

  logger.info(
    {
      modelId,
      cliProvider: cli.cliProvider,
      command: cli.command,
      hasSession: !!options.cliSessionId,
      streaming: true,
    },
    "Making streaming CLI AI call",
  );

  const decoder = createDecoder(cli.cliProvider);
  const runner = new CliSubprocessRunner(decoder);

  const signal =
    options.timeout && options.timeout > 0
      ? AbortSignal.timeout(options.timeout)
      : undefined;

  return runner.runStream(spawnConfig, signal);
}
