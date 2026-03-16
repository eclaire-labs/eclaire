/**
 * Table formatters for new CLI entities: MCP servers, settings, users, agents, API keys.
 * Uses cli-table3 + chalk, same stack as existing tables.ts.
 */

import chalk from "chalk";
import Table from "cli-table3";
import { colors, icons } from "./colors.js";

// =============================================================================
// MCP Servers
// =============================================================================

export interface McpServerDisplay {
  id: string;
  name: string;
  transport: string;
  command: string | null;
  args: string[] | null;
  enabled: boolean;
  toolMode: string | null;
}

export function createMcpServersTable(servers: McpServerDisplay[]): string {
  const table = new Table({
    head: [
      colors.header("ID"),
      colors.header("Name"),
      colors.header("Transport"),
      colors.header("Command"),
      colors.header("Enabled"),
      colors.header("Tool Mode"),
    ],
    style: { head: [], border: ["gray"] },
  });

  for (const s of servers) {
    table.push([
      colors.emphasis(s.id),
      s.name,
      formatTransport(s.transport),
      colors.dim(s.command || "-"),
      s.enabled
        ? colors.success(`${icons.active} yes`)
        : colors.error(`${icons.disabled} no`),
      colors.dim(s.toolMode || "managed"),
    ]);
  }

  return table.toString();
}

export function createMcpServerInfoTable(
  server: McpServerDisplay & {
    description?: string | null;
    connectTimeout?: number | null;
  },
): string {
  const table = new Table({
    style: { head: [], border: ["gray"] },
  });

  table.push([colors.emphasis("ID"), server.id]);
  table.push([colors.emphasis("Name"), server.name]);
  table.push([
    colors.emphasis("Description"),
    server.description || colors.dim("none"),
  ]);
  table.push([colors.emphasis("Transport"), formatTransport(server.transport)]);
  table.push([
    colors.emphasis("Command"),
    server.command || colors.dim("none"),
  ]);
  table.push([
    colors.emphasis("Args"),
    server.args?.length ? server.args.join(" ") : colors.dim("none"),
  ]);
  table.push([
    colors.emphasis("Connect Timeout"),
    server.connectTimeout ? `${server.connectTimeout}ms` : colors.dim("none"),
  ]);
  table.push([
    colors.emphasis("Enabled"),
    server.enabled ? colors.success("yes") : colors.error("no"),
  ]);
  table.push([
    colors.emphasis("Tool Mode"),
    server.toolMode || colors.dim("managed"),
  ]);

  return table.toString();
}

function formatTransport(transport: string): string {
  switch (transport) {
    case "stdio":
      return chalk.blue(transport);
    case "sse":
      return chalk.yellow(transport);
    case "http":
      return chalk.green(transport);
    default:
      return chalk.white(transport);
  }
}

// =============================================================================
// Instance Settings
// =============================================================================

export function createSettingsTable(
  settings: Record<string, unknown>,
  knownKeys: Record<string, string>,
): string {
  const table = new Table({
    head: [colors.header("Key"), colors.header("Value"), colors.header("Type")],
    style: { head: [], border: ["gray"] },
  });

  // Show all known keys, including those not yet set
  for (const [key, type] of Object.entries(knownKeys)) {
    const value = settings[key];
    const displayValue =
      value !== undefined
        ? formatSettingValue(value, type)
        : colors.dim("not set");
    table.push([colors.emphasis(key), displayValue, colors.dim(type)]);
  }

  // Show any extra keys not in known list
  for (const [key, value] of Object.entries(settings)) {
    if (!(key in knownKeys)) {
      table.push([colors.emphasis(key), String(value), colors.dim("unknown")]);
    }
  }

  return table.toString();
}

function formatSettingValue(value: unknown, type: string): string {
  if (type === "boolean") {
    return value ? colors.success("true") : colors.error("false");
  }
  return String(value);
}

// =============================================================================
// Users
// =============================================================================

export interface UserDisplay {
  id: string;
  email: string;
  displayName: string | null;
  isInstanceAdmin: boolean;
  createdAt: Date | number;
}

export function createUsersTable(users: UserDisplay[]): string {
  const table = new Table({
    head: [
      colors.header("Email"),
      colors.header("Display Name"),
      colors.header("Admin"),
      colors.header("Created"),
    ],
    style: { head: [], border: ["gray"] },
  });

  for (const u of users) {
    table.push([
      colors.emphasis(u.email),
      u.displayName || colors.dim("-"),
      u.isInstanceAdmin ? chalk.green.bold("yes") : colors.dim("no"),
      formatDate(u.createdAt),
    ]);
  }

  return table.toString();
}

// =============================================================================
// Agents
// =============================================================================

export interface AgentDisplay {
  id: string;
  name: string;
  description: string | null;
  modelId: string | null;
  toolNames: string[];
  skillNames: string[];
  createdAt: Date | number;
}

export function createAgentsTable(agents: AgentDisplay[]): string {
  const table = new Table({
    head: [
      colors.header("ID"),
      colors.header("Name"),
      colors.header("Model"),
      colors.header("Tools"),
      colors.header("Skills"),
      colors.header("Created"),
    ],
    style: { head: [], border: ["gray"] },
  });

  for (const a of agents) {
    table.push([
      colors.emphasis(truncate(a.id, 22)),
      a.name,
      a.modelId ? chalk.blue(a.modelId) : colors.dim("system default"),
      a.toolNames.length > 0
        ? chalk.cyan(String(a.toolNames.length))
        : colors.dim("0"),
      a.skillNames.length > 0
        ? chalk.magenta(String(a.skillNames.length))
        : colors.dim("0"),
      formatDate(a.createdAt),
    ]);
  }

  return table.toString();
}

export function createAgentInfoTable(
  agent: AgentDisplay & { systemPrompt: string },
): string {
  const table = new Table({
    style: { head: [], border: ["gray"] },
    colWidths: [20, 60],
  });

  table.push([colors.emphasis("ID"), agent.id]);
  table.push([colors.emphasis("Name"), agent.name]);
  table.push([
    colors.emphasis("Description"),
    agent.description || colors.dim("none"),
  ]);
  table.push([
    colors.emphasis("Model"),
    agent.modelId ? chalk.blue(agent.modelId) : colors.dim("system default"),
  ]);
  table.push([
    colors.emphasis("Tools"),
    agent.toolNames.length > 0
      ? agent.toolNames.join(", ")
      : colors.dim("none"),
  ]);
  table.push([
    colors.emphasis("Skills"),
    agent.skillNames.length > 0
      ? agent.skillNames.join(", ")
      : colors.dim("none"),
  ]);
  table.push([
    colors.emphasis("System Prompt"),
    truncate(agent.systemPrompt, 200),
  ]);
  table.push([colors.emphasis("Created"), formatDate(agent.createdAt)]);

  return table.toString();
}

// =============================================================================
// API Keys
// =============================================================================

export interface ApiKeyDisplay {
  id: string;
  displayKey: string;
  name: string;
  actorKind: string;
  actorName: string | null;
  scopes: string[];
  lastUsedAt: Date | number | null;
  isActive: boolean;
  createdAt: Date | number;
}

export function createApiKeysTable(keys: ApiKeyDisplay[]): string {
  const table = new Table({
    head: [
      colors.header("Key"),
      colors.header("Name"),
      colors.header("Actor"),
      colors.header("Scopes"),
      colors.header("Last Used"),
      colors.header("Status"),
    ],
    style: { head: [], border: ["gray"] },
  });

  for (const k of keys) {
    table.push([
      colors.dim(k.displayKey),
      k.name,
      formatActorKind(k.actorKind, k.actorName),
      formatScopes(k.scopes),
      k.lastUsedAt ? formatDate(k.lastUsedAt) : colors.dim("never"),
      k.isActive ? colors.success("active") : colors.error("revoked"),
    ]);
  }

  return table.toString();
}

function formatActorKind(kind: string, name: string | null): string {
  const label = name || kind;
  switch (kind) {
    case "human":
      return chalk.blue(label);
    case "service":
      return chalk.yellow(label);
    case "agent":
      return chalk.magenta(label);
    default:
      return chalk.white(label);
  }
}

function formatScopes(scopes: string[]): string {
  if (scopes.includes("*")) return chalk.yellow("full access");
  if (scopes.length <= 2) return colors.dim(scopes.join(", "));
  return colors.dim(`${scopes.slice(0, 2).join(", ")} +${scopes.length - 2}`);
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  return colors.dim(d.toLocaleDateString());
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.substring(0, maxLength - 3)}...`;
}
