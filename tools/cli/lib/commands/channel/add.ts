import chalk from "chalk";
import { TelegramConfigSchema } from "@eclaire/channels-telegram";
import { DiscordConfigSchema } from "@eclaire/channels-discord";
import { SlackConfigSchema } from "@eclaire/channels-slack";
import { getChannelRegistry } from "../../db/adapters.js";
import { createChannel } from "../../db/channels.js";
import { getDefaultUser } from "../../db/users.js";
import { colors, icons } from "../../ui/colors.js";
import {
  intro,
  outro,
  cancel,
  note,
  textInput,
  passwordInput,
  selectOne,
  confirm,
  isCancelled,
  CancelledError,
} from "../../ui/clack.js";

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

const PLATFORM_GUIDES: Record<string, { title: string; body: string }> = {
  telegram: {
    title: "Telegram Setup",
    body: [
      `1. Open Telegram and message ${chalk.bold("@BotFather")}`,
      `2. Send ${chalk.bold("/newbot")} and follow the prompts to create your bot`,
      `3. Copy the ${chalk.bold("bot token")} from BotFather's response`,
      `4. Add your bot to the group or channel where it should operate`,
      `5. To find the ${chalk.bold("chat ID")}: forward a message from the chat`,
      `   to ${chalk.bold("@userinfobot")}, or use the Telegram API's getUpdates method`,
      `   ${chalk.gray("(group IDs typically start with -100)")}`,
    ].join("\n"),
  },
  discord: {
    title: "Discord Setup",
    body: [
      `1. Go to ${chalk.bold("discord.com/developers/applications")} and create an app`,
      `2. Navigate to ${chalk.bold("Bot")} > click ${chalk.bold("Reset Token")} > copy it`,
      `3. Under ${chalk.bold("Privileged Gateway Intents")}, enable:`,
      `   ${chalk.gray("Message Content Intent, Server Members Intent")}`,
      `4. Go to ${chalk.bold("OAuth2 > URL Generator")} > select ${chalk.bold("bot")} scope`,
      `   and required permissions > use the URL to invite the bot to your server`,
      `5. To find a ${chalk.bold("channel ID")}: enable ${chalk.bold("Developer Mode")} in`,
      `   Discord settings > right-click a channel > ${chalk.bold("Copy Channel ID")}`,
    ].join("\n"),
  },
  slack: {
    title: "Slack Setup",
    body: [
      `1. Go to ${chalk.bold("api.slack.com/apps")} and create a new app`,
      `2. Enable ${chalk.bold("Socket Mode")} > generate an ${chalk.bold("App-Level Token")} (xapp-)`,
      `3. Under ${chalk.bold("OAuth & Permissions")}, add Bot Token Scopes:`,
      `   ${chalk.gray("chat:write, channels:history, channels:read, app_mentions:read")}`,
      `4. Install the app to your workspace > copy the`,
      `   ${chalk.bold("Bot User OAuth Token")} (xoxb-)`,
      `5. Invite the bot to a channel: ${chalk.bold("/invite @yourbot")}`,
      `6. To find the ${chalk.bold("channel ID")}: open channel details > scroll`,
      `   to the bottom to find the ID ${chalk.gray("(starts with C)")}`,
    ].join("\n"),
  },
};

export async function addCommand(): Promise<void> {
  try {
    intro(colors.header("Add Channel"));

    // 1. Select platform
    const platform = await selectOne<string>({
      message: "Select platform:",
      options: [
        { value: "telegram", label: "Telegram" },
        { value: "discord", label: "Discord" },
        { value: "slack", label: "Slack" },
      ],
    });

    // 2. Show platform-specific setup guide
    const guide = PLATFORM_GUIDES[platform];
    if (guide) note(guide.body, guide.title);

    // 3. Channel name
    const name = await textInput({
      message: "Channel name:",
      validate: (input: string) => {
        if (input.length === 0) return "Channel name is required";
        return undefined;
      },
    });

    // 4. Collect config fields from schema metadata
    const schema = PLATFORM_SCHEMAS[platform];
    if (!schema) {
      cancel(`Unsupported platform: ${platform}`);
      process.exit(1);
    }

    const rawConfig = await promptConfigFromSchema(schema);

    // 5. Select capability
    const capabilities = PLATFORM_CAPABILITIES[platform] || ["notification"];
    const capability = await selectOne<string>({
      message: "Select capability:",
      options: capabilities.map((c: string) => ({
        value: c,
        label: c.charAt(0).toUpperCase() + c.slice(1),
      })),
    });

    // 6. Validate and encrypt config via adapter
    const registry = getChannelRegistry();
    // biome-ignore lint/suspicious/noExplicitAny: platform is validated by selectOne options above
    const adapter = registry.get(platform as any);
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

    outro(
      colors.success(
        `${icons.success} Channel created: ${colors.emphasis(channel.name)} (${channel.id})`,
      ),
    );
  } catch (error) {
    if (isCancelled(error) || error instanceof CancelledError) {
      cancel("Cancelled");
      return;
    }
    if (error instanceof Error && error.message.includes("validation")) {
      cancel(`Validation error: ${error.message}`);
    } else {
      cancel(
        `Failed to add channel: ${error instanceof Error ? error.message : "Unknown error"}`,
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
    const meta = fd?._zod?.bag?.meta as
      | { description?: string; examples?: unknown[] }
      | undefined;
    const def = fd?._zod?.def;
    const description = meta?.description || fieldName;
    const examples = meta?.examples as string[] | undefined;
    const isSecret =
      fieldName.includes("token") ||
      fieldName.includes("key") ||
      fieldName.includes("secret");
    const isOptional = def?.type === "optional";
    const hasDefault = def?.defaultValue !== undefined;

    // Check if it's an enum field
    const values = def?.values as string[] | undefined;
    if (values && Array.isArray(values)) {
      const value = await selectOne<string>({
        message: `${description}:`,
        options: values.map((v: string) => ({ value: v, label: v })),
      });
      config[fieldName] = value;
      continue;
    }

    // Check if it's a boolean field
    if (def?.type === "boolean" || typeof def?.defaultValue === "boolean") {
      const value = await confirm({
        message: `${description}:`,
        initialValue: def?.defaultValue ?? true,
      });
      config[fieldName] = value;
      continue;
    }

    // String field (regular or secret)
    const hint = examples?.length
      ? ` ${colors.dim(`(e.g. ${examples[0]})`)}`
      : "";

    if (isSecret) {
      const value = await passwordInput({
        message: `${description}${hint}:`,
        validate: (input: string) => {
          if (!isOptional && !hasDefault && input.length === 0) {
            return `${fieldName} is required`;
          }
          return undefined;
        },
      });

      // Skip optional fields left empty
      if (isOptional && value === "") continue;
      config[fieldName] = value;
    } else {
      const value = await textInput({
        message: `${description}${hint}:`,
        validate: (input: string) => {
          if (!isOptional && !hasDefault && input.length === 0) {
            return `${fieldName} is required`;
          }
          return undefined;
        },
      });

      // Skip optional fields left empty
      if (isOptional && value === "") continue;
      config[fieldName] = value;
    }
  }

  return config;
}
