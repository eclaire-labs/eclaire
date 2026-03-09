import chalk from "chalk";
import ora from "ora";
import { getChannelRegistry } from "../../db/adapters.js";
import { getChannel } from "../../db/channels.js";
import { colors, icons } from "../../ui/colors.js";

export async function testCommand(id: string): Promise<void> {
  try {
    const channel = await getChannel(id);
    if (!channel) {
      console.error(
        colors.error(`\n  ${icons.error} Channel not found: ${id}\n`),
      );
      process.exit(1);
    }

    if (!channel.isActive) {
      console.error(
        colors.warning(
          `\n  ${icons.warning} Channel is disabled. Enable it first with: eclaire channel enable ${id}\n`,
        ),
      );
      process.exit(1);
    }

    const registry = getChannelRegistry();
    const adapter = registry.get(
      channel.platform as "telegram" | "discord" | "slack",
    );

    // Verify config decrypts properly
    const decrypted = adapter.decryptConfig(channel.config);
    if (!decrypted) {
      console.error(
        colors.error(
          `\n  ${icons.error} Failed to decrypt channel config. Check your MASTER_ENCRYPTION_KEY.\n`,
        ),
      );
      process.exit(1);
    }

    const spinner = ora("Sending test message...").start();

    const result = await adapter.send(
      {
        id: channel.id,
        userId: channel.userId,
        name: channel.name,
        platform: channel.platform as "telegram" | "discord" | "slack",
        capability: channel.capability as
          | "notification"
          | "chat"
          | "bidirectional",
        config: channel.config,
        isActive: channel.isActive,
      },
      `Test message from Eclaire CLI (${new Date().toLocaleTimeString()})`,
    );

    if (result.success) {
      spinner.succeed(chalk.green("Test message sent successfully!"));
    } else {
      spinner.fail(
        chalk.red(`Failed to send: ${result.error || "Unknown error"}`),
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      colors.error(
        `\n  ${icons.error} Test failed: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      ),
    );
    process.exit(1);
  }
}
