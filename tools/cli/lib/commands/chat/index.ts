/**
 * Chat TUI command registration
 */

import { Command } from "commander";

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Launch interactive chat with AI")
    .option("--model <id>", "Override model ID (default: active backend model)")
    .option("--context <ctx>", "AI context to use", "backend")
    .option("--no-stream", "Disable streaming (wait for full response)")
    .action(async (options: { model?: string; context: string; stream: boolean }) => {
      // Dynamic import to avoid loading ink/react unless chat is used
      const { startChat } = await import("./app.js");
      await startChat(options);
    });
}
