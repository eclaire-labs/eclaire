import { PermissionFlagsBits } from "discord.js";
import { describe, expect, it } from "vitest";
import { checkBotPermissions } from "../permissions.js";

const ALL_REQUIRED = new Set([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
]);

function makeChannel(permissionFlags: Set<bigint>, meResolvable = true) {
  const me = meResolvable ? { id: "bot-user" } : null;
  return {
    guild: { members: { me } },
    permissionsFor: (target: unknown) => {
      if (!target) return null;
      return {
        has: (flag: bigint) => permissionFlags.has(flag),
      };
    },
  };
}

function makeClient(hasUser = false) {
  return {
    user: hasUser ? { id: "bot-user" } : null,
  };
}

describe("checkBotPermissions", () => {
  it("returns ok when all permissions are present", () => {
    const channel = makeChannel(ALL_REQUIRED);
    const client = makeClient();
    const result = checkBotPermissions(channel as any, client as any);
    expect(result).toEqual({ ok: true, missing: [] });
  });

  it("reports missing ViewChannel", () => {
    const flags = new Set(ALL_REQUIRED);
    flags.delete(PermissionFlagsBits.ViewChannel);
    const channel = makeChannel(flags);
    const result = checkBotPermissions(channel as any, makeClient() as any);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("ViewChannel");
  });

  it("reports missing SendMessages", () => {
    const flags = new Set(ALL_REQUIRED);
    flags.delete(PermissionFlagsBits.SendMessages);
    const channel = makeChannel(flags);
    const result = checkBotPermissions(channel as any, makeClient() as any);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("SendMessages");
  });

  it("reports missing ReadMessageHistory", () => {
    const flags = new Set(ALL_REQUIRED);
    flags.delete(PermissionFlagsBits.ReadMessageHistory);
    const channel = makeChannel(flags);
    const result = checkBotPermissions(channel as any, makeClient() as any);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("ReadMessageHistory");
  });

  it("reports multiple missing permissions", () => {
    const channel = makeChannel(new Set());
    const result = checkBotPermissions(channel as any, makeClient() as any);
    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        "ViewChannel",
        "SendMessages",
        "ReadMessageHistory",
      ]),
    );
  });

  it("returns error when bot member cannot be resolved", () => {
    const channel = makeChannel(ALL_REQUIRED, false);
    const result = checkBotPermissions(
      channel as any,
      makeClient(false) as any,
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("Unable to resolve bot member");
  });

  it("falls back to client.user when guild.members.me is null", () => {
    const channel = makeChannel(ALL_REQUIRED, false);
    const result = checkBotPermissions(channel as any, makeClient(true) as any);
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("returns error when permissionsFor returns null", () => {
    const channel = {
      guild: { members: { me: { id: "bot" } } },
      permissionsFor: () => null,
    };
    const result = checkBotPermissions(channel as any, makeClient() as any);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain("Unable to resolve permissions");
  });
});
