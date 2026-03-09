import { PermissionFlagsBits, type Client, type TextChannel } from "discord.js";

const REQUIRED_PERMISSIONS = [
  { flag: PermissionFlagsBits.ViewChannel, name: "ViewChannel" },
  { flag: PermissionFlagsBits.SendMessages, name: "SendMessages" },
  { flag: PermissionFlagsBits.ReadMessageHistory, name: "ReadMessageHistory" },
] as const;

export interface PermissionCheckResult {
  ok: boolean;
  missing: string[];
}

/**
 * Checks whether the bot has the required permissions in a text channel.
 * Returns which permissions are missing (if any).
 */
export function checkBotPermissions(
  channel: TextChannel,
  client: Client,
): PermissionCheckResult {
  const me = channel.guild.members.me ?? client.user;
  if (!me) {
    return { ok: false, missing: ["Unable to resolve bot member"] };
  }

  const permissions = channel.permissionsFor(me);
  if (!permissions) {
    return { ok: false, missing: ["Unable to resolve permissions"] };
  }

  const missing: string[] = [];
  for (const { flag, name } of REQUIRED_PERMISSIONS) {
    if (!permissions.has(flag)) {
      missing.push(name);
    }
  }

  return { ok: missing.length === 0, missing };
}
