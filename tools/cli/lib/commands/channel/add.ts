import inquirer from "inquirer";
import chalk from "chalk";
import { TelegramConfigSchema } from "@eclaire/channels-telegram";
import { DiscordConfigSchema } from "@eclaire/channels-discord";
import { SlackConfigSchema } from "@eclaire/channels-slack";
import { getChannelRegistry } from "../../db/adapters.js";
import { createChannel } from "../../db/channels.js";
import { getDefaultUser } from "../../db/users.js";
import { colors, icons } from "../../ui/colors.js";

// biome-ignore lint/suspicious/noExplicitAny: Zod schemas from different packages, using shape at runtime
const PLATFORM_SCHEMAS: Record<string, any> = {
  telegram: TelegramConfigSchema,
  discord: DiscordConfigSchema,
  slack: SlackConfigSchema,
};

const PLATFORM_CAPABILITIES: Record<string, string[]> = {
  telegram: ["notification", "chat", "bidirectional"],
  discord: ["notification", "chat", "bidirectional"],
  slack: ["notification", "chat", "bidirectional"],
};

const PLATFORM_GUIDES: Record<string, string> = {
  telegram: `
  ${chalk.cyan.bold("Telegram Setup")}

  ${chalk.dim("1.")} Open Telegram and message ${chalk.bold("@BotFather")}
  ${chalk.dim("2.")} Send ${chalk.bold("/newbot")} and follow the prompts to create your bot
  ${chalk.dim("3.")} Copy the ${chalk.bold("bot token")} from BotFather's response
  ${chalk.dim("4.")} Add your bot to the group or channel where it should operate
  ${chalk.dim("5.")} To find the ${chalk.bold("chat ID")}: forward a message from the chat
     to ${chalk.bold("@userinfobot")}, or use the Telegram API's getUpdates method
     ${chalk.gray("(group IDs typically start with -100)")}
`,
  discord: `
  ${chalk.cyan.bold("Discord Setup")}

  ${chalk.dim("1.")} Go to ${chalk.bold("discord.com/developers/applications")} and create an app
  ${chalk.dim("2.")} Navigate to ${chalk.bold("Bot")} → click ${chalk.bold("Reset Token")} → copy it
  ${chalk.dim("3.")} Under ${chalk.bold("Privileged Gateway Intents")}, enable:
     ${chalk.gray("Message Content Intent, Server Members Intent")}
  ${chalk.dim("4.")} Go to ${chalk.bold("OAuth2 → URL Generator")} → select ${chalk.bold("bot")} scope
     and required permissions → use the URL to invite the bot to your server
  ${chalk.dim("5.")} To find a ${chalk.bold("channel ID")}: enable ${chalk.bold("Developer Mode")} in
     Discord settings → right-click a channel → ${chalk.bold("Copy Channel ID")}
`,
  slack: `
  ${chalk.cyan.bold("Slack Setup")}

  ${chalk.dim("1.")} Go to ${chalk.bold("api.slack.com/apps")} and create a new app
  ${chalk.dim("2.")} Enable ${chalk.bold("Socket Mode")} → generate an ${chalk.bold("App-Level Token")} (xapp-)
  ${chalk.dim("3.")} Under ${chalk.bold("OAuth & Permissions")}, add Bot Token Scopes:
     ${chalk.gray("chat:write, channels:history, channels:read, app_mentions:read")}
  ${chalk.dim("4.")} Install the app to your workspace → copy the
     ${chalk.bold("Bot User OAuth Token")} (xoxb-)
  ${chalk.dim("5.")} Invite the bot to a channel: ${chalk.bold("/invite @yourbot")}
  ${chalk.dim("6.")} To find the ${chalk.bold("channel ID")}: open channel details → scroll
     to the bottom to find the ID ${chalk.gray("(starts with C)")}
`,
};

export async function addCommand(): Promise<void> {
  try {
    // 1. Select platform
    const { platform } = await inquirer.prompt([
      {
        type: "select",
        name: "platform",
        message: "Select platform:",
        choices: [
          { name: "Telegram", value: "telegram" },
          { name: "Discord", value: "discord" },
          { name: "Slack", value: "slack" },
        ],
      },
    ]);

    // 2. Show platform-specific setup guide
    const guide = PLATFORM_GUIDES[platform];
    if (guide) console.log(guide);

    // 3. Channel name
    const { name } = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Channel name:",
        validate: (input: string) =>
          input.length > 0 || "Channel name is required",
      },
    ]);

    // 4. Collect config fields from schema metadata
    const schema = PLATFORM_SCHEMAS[platform];
    if (!schema) {
      console.error(colors.error(`Unsupported platform: ${platform}`));
      process.exit(1);
    }

    const rawConfig = await promptConfigFromSchema(schema);

    // 5. Select capability
    const capabilities = PLATFORM_CAPABILITIES[platform] || ["notification"];
    const { capability } = await inquirer.prompt([
      {
        type: "select",
        name: "capability",
        message: "Select capability:",
        choices: capabilities.map((c: string) => ({
          name: c.charAt(0).toUpperCase() + c.slice(1),
          value: c,
        })),
        default: "bidirectional",
      },
    ]);

    // 6. Validate and encrypt config via adapter
    const registry = getChannelRegistry();
    const adapter = registry.get(platform);
    const encryptedConfig = await adapter.validateAndEncryptConfig(rawConfig);

    // 7. Resolve user
    const user = await getDefaultUser();

    // 8. Insert into DB
    const channel = await createChannel({
      userId: user.id,
      name,
      platform,
      capability,
      config: encryptedConfig,
    });

    console.log(
      chalk.green(
        `\n  ${icons.success} Channel created: ${colors.emphasis(channel.name)} (${channel.id})\n`,
      ),
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("validation")) {
      console.error(colors.error(`\n  ${icons.error} Validation error: ${error.message}\n`));
    } else {
      console.error(
        colors.error(
          `\n  ${icons.error} Failed to add channel: ${error instanceof Error ? error.message : "Unknown error"}\n`,
        ),
      );
    }
    process.exit(1);
  }
}

async function promptConfigFromSchema(
  // biome-ignore lint/suspicious/noExplicitAny: Introspecting Zod schema internals at runtime
  schema: any,
): Promise<Record<string, unknown>> {
  const config: Record<string, unknown> = {};
  // biome-ignore lint/suspicious/noExplicitAny: Zod shape is untyped at runtime
  const shape = schema.shape as Record<string, any>;

  for (const [fieldName, fieldDef] of Object.entries(shape)) {
    // biome-ignore lint/suspicious/noExplicitAny: Zod internal structure
    const fd = fieldDef as any;
    const meta = fd?._zod?.bag?.meta as { description?: string; examples?: unknown[] } | undefined;
    const def = fd?._zod?.def;
    const description = meta?.description || fieldName;
    const examples = meta?.examples as string[] | undefined;
    const isSecret = fieldName.includes("token") || fieldName.includes("key") || fieldName.includes("secret");
    const isOptional = def?.type === "optional";
    const hasDefault = def?.defaultValue !== undefined;

    // Check if it's an enum field
    const values = def?.values as string[] | undefined;
    if (values && Array.isArray(values)) {
      const { value } = await inquirer.prompt([
        {
          type: "select",
          name: "value",
          message: `${description}:`,
          choices: values.map((v: string) => ({ name: v, value: v })),
          default: def?.defaultValue,
        },
      ]);
      config[fieldName] = value;
      continue;
    }

    // Check if it's a boolean field
    if (def?.type === "boolean" || typeof def?.defaultValue === "boolean") {
      const { value } = await inquirer.prompt([
        {
          type: "confirm",
          name: "value",
          message: `${description}:`,
          default: def?.defaultValue ?? true,
        },
      ]);
      config[fieldName] = value;
      continue;
    }

    // String field (regular or secret)
    const hint = examples?.length ? ` ${colors.dim(`(e.g. ${examples[0]})`)}` : "";
    const { value } = await inquirer.prompt([
      {
        type: isSecret ? "password" : "input",
        name: "value",
        message: `${description}${hint}:`,
        ...(isSecret ? { mask: "*" } : {}),
        validate: (input: string) => {
          if (!isOptional && !hasDefault && input.length === 0) {
            return `${fieldName} is required`;
          }
          return true;
        },
      },
    ]);

    // Skip optional fields left empty
    if (isOptional && value === "") continue;

    config[fieldName] = value;
  }

  return config;
}
