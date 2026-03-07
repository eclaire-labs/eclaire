/**
 * Chat TUI command registration
 */

import { Command } from "commander";

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Launch interactive chat with AI (connects to backend)")
    .option("--no-stream", "Disable streaming (wait for full response)")
    .option("--conversation <id>", "Resume an existing conversation")
    .action(async (options: { stream: boolean; conversation?: string }) => {
      // Dynamic import to avoid loading ink/react unless chat is used
      const { startChat } = await import("./app.js");
      await startChat(options);
    });
}
