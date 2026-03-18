/**
 * Shared slash-command registry and helpers.
 *
 * Pure TypeScript — no React, Ink, or platform SDK dependencies.
 * Consumed by the web client, CLI TUI, and channel adapters.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlashItemKind = "command" | "agent" | "skill";

export type SlashSurface = "web" | "cli" | "channel";

export const COMMAND_IDS = [
  "help",
  "new",
  "history",
  "model",
  "thinking",
  "clear",
  "exit",
] as const;
export type CommandId = (typeof COMMAND_IDS)[number];

export interface SlashItem {
  kind: SlashItemKind;
  /** Canonical id — for commands: CommandId, for agents/skills: the entity name/id */
  id: string;
  /** Display label shown in the palette / menu */
  label: string;
  /** Short description */
  description: string;
  /** Lucide icon name hint (consumed by the rendering layer) */
  icon?: string;
  /** Surfaces that show this item. `undefined` means all surfaces. */
  surfaces?: SlashSurface[];
  /** True when selecting inserts text into the composer instead of executing */
  insertsText?: boolean;
}

export interface SlashContextAgent {
  id: string;
  name: string;
  skillNames: string[];
}

export interface SlashContext {
  activeAgentId: string;
  agents: SlashContextAgent[];
  surface: SlashSurface;
}

export type ResolvedAction =
  | { type: "execute-command"; commandId: CommandId; args: string }
  | { type: "switch-agent"; agentId: string; agentName: string }
  | { type: "insert-scaffold"; text: string }
  | { type: "send-rewritten"; text: string }
  | { type: "error"; message: string };

// ---------------------------------------------------------------------------
// Builtin commands
// ---------------------------------------------------------------------------

export const BUILTIN_COMMANDS: SlashItem[] = [
  {
    kind: "command",
    id: "new",
    label: "new",
    description: "Start a new conversation",
    icon: "Plus",
  },
  {
    kind: "command",
    id: "history",
    label: "history",
    description: "Show recent conversations",
    icon: "History",
  },
  {
    kind: "command",
    id: "model",
    label: "model",
    description: "Show current model",
    icon: "Cpu",
  },
  {
    kind: "command",
    id: "thinking",
    label: "thinking",
    description: "Toggle thinking mode",
    icon: "Brain",
  },
  {
    kind: "command",
    id: "clear",
    label: "clear",
    description: "Clear conversation and start fresh",
    icon: "Trash2",
  },
  {
    kind: "command",
    id: "help",
    label: "help",
    description: "Show available commands",
    icon: "HelpCircle",
  },
  {
    kind: "command",
    id: "exit",
    label: "exit",
    description: "Exit the chat",
    icon: "LogOut",
    surfaces: ["cli"],
  },
];

// ---------------------------------------------------------------------------
// Item building
// ---------------------------------------------------------------------------

/**
 * Build the full list of slash items for a given context.
 *
 * Merges builtin commands, agent-switch items, and skill items
 * (filtered to the active agent's enabled skills). Items are filtered
 * by the current surface.
 */
export function buildSlashItems(ctx: SlashContext): SlashItem[] {
  const items: SlashItem[] = [];

  // 1. Builtin commands (surface-filtered)
  for (const cmd of BUILTIN_COMMANDS) {
    if (!cmd.surfaces || cmd.surfaces.includes(ctx.surface)) {
      items.push(cmd);
    }
  }

  // 2. Agent-switch items (one per agent, excluding the active one)
  for (const agent of ctx.agents) {
    if (agent.id === ctx.activeAgentId) continue;
    items.push({
      kind: "agent",
      id: agent.id,
      label: agent.name,
      description: `Switch to ${agent.name}`,
      icon: "Bot",
    });
  }

  // 3. Skill items (only the active agent's enabled skills)
  const activeAgent = ctx.agents.find((a) => a.id === ctx.activeAgentId);
  if (activeAgent) {
    for (const skillName of activeAgent.skillNames) {
      items.push({
        kind: "skill",
        id: skillName,
        label: skillName,
        description: `Use the ${skillName} skill`,
        icon: "Sparkles",
        insertsText: true,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Filtering & ranking
// ---------------------------------------------------------------------------

/**
 * Filter and rank slash items by a query string (the text after `/`).
 *
 * Uses case-insensitive prefix matching on `id` and `label`.
 * Returns items grouped by kind: commands first, then agents, then skills.
 */
export function filterSlashItems(
  items: SlashItem[],
  query: string,
): SlashItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return items;

  const matches = items.filter(
    (item) =>
      item.id.toLowerCase().startsWith(q) ||
      item.label.toLowerCase().startsWith(q),
  );

  return matches.sort((a, b) => {
    // Group by kind order
    const kindOrder: Record<SlashItemKind, number> = {
      command: 0,
      agent: 1,
      skill: 2,
    };
    const kindDiff = kindOrder[a.kind] - kindOrder[b.kind];
    if (kindDiff !== 0) return kindDiff;

    // Within a kind, prefer exact id match, then shorter id
    const aExact = a.id.toLowerCase() === q ? 0 : 1;
    const bExact = b.id.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    return a.id.length - b.id.length;
  });
}

/**
 * Group slash items by kind for display purposes.
 */
export function groupSlashItems(
  items: SlashItem[],
): { kind: SlashItemKind; label: string; items: SlashItem[] }[] {
  const groups: { kind: SlashItemKind; label: string; items: SlashItem[] }[] =
    [];
  const kindLabels: Record<SlashItemKind, string> = {
    command: "Commands",
    agent: "Agents",
    skill: "Skills",
  };
  const kindOrder: SlashItemKind[] = ["command", "agent", "skill"];

  for (const kind of kindOrder) {
    const kindItems = items.filter((item) => item.kind === kind);
    if (kindItems.length > 0) {
      groups.push({ kind, label: kindLabels[kind], items: kindItems });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/**
 * Build the prompt scaffold for a skill invocation.
 */
export function buildSkillScaffold(skillName: string, task: string): string {
  return `Use the "${skillName}" skill to: ${task}`;
}

/**
 * Parse slash input and resolve it to an action.
 *
 * Returns `null` if the input does not start with `/`.
 */
export function parseSlashInput(
  input: string,
  ctx: SlashContext,
): ResolvedAction | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIdx = trimmed.indexOf(" ");
  const name = spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx);
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();
  const nameLower = name.toLowerCase();

  // Check builtin commands first
  if (COMMAND_IDS.includes(nameLower as CommandId)) {
    return {
      type: "execute-command",
      commandId: nameLower as CommandId,
      args,
    };
  }

  // /agent <name>
  if (nameLower === "agent") {
    if (!args) {
      return { type: "error", message: "Usage: /agent <name>" };
    }
    const argsLower = args.toLowerCase();
    const match = ctx.agents.find(
      (a) =>
        a.id.toLowerCase() === argsLower || a.name.toLowerCase() === argsLower,
    );
    if (!match) {
      const available = ctx.agents.map((a) => a.name).join(", ");
      return {
        type: "error",
        message: `Unknown agent "${args}". Available: ${available}`,
      };
    }
    return { type: "switch-agent", agentId: match.id, agentName: match.name };
  }

  // /skill <name> [task]
  if (nameLower === "skill") {
    if (!args) {
      return { type: "error", message: "Usage: /skill <name> <task>" };
    }
    const skillSpaceIdx = args.indexOf(" ");
    const skillName =
      skillSpaceIdx === -1 ? args : args.slice(0, skillSpaceIdx);
    const task =
      skillSpaceIdx === -1 ? "" : args.slice(skillSpaceIdx + 1).trim();

    // Validate skill exists on the active agent
    const activeAgent = ctx.agents.find((a) => a.id === ctx.activeAgentId);
    const skillNameLower = skillName.toLowerCase();
    const matchedSkill = activeAgent?.skillNames.find(
      (s) => s.toLowerCase() === skillNameLower,
    );
    if (!matchedSkill) {
      const available = activeAgent?.skillNames.join(", ") || "none";
      return {
        type: "error",
        message: `Unknown skill "${skillName}". Available: ${available}`,
      };
    }

    if (!task) {
      // No task text — insert scaffold for user to fill in
      return { type: "insert-scaffold", text: `/skill ${matchedSkill} ` };
    }
    return {
      type: "send-rewritten",
      text: buildSkillScaffold(matchedSkill, task),
    };
  }

  // Check if it's a direct agent name (e.g., /agentName instead of /agent agentName)
  const directAgent = ctx.agents.find(
    (a) =>
      a.id.toLowerCase() === nameLower || a.name.toLowerCase() === nameLower,
  );
  if (directAgent) {
    if (args) {
      // Treat as a one-shot prompt for that agent
      return {
        type: "switch-agent",
        agentId: directAgent.id,
        agentName: directAgent.name,
      };
    }
    return {
      type: "switch-agent",
      agentId: directAgent.id,
      agentName: directAgent.name,
    };
  }

  // Check if it's a direct skill name
  const activeAgent = ctx.agents.find((a) => a.id === ctx.activeAgentId);
  const directSkill = activeAgent?.skillNames.find(
    (s) => s.toLowerCase() === nameLower,
  );
  if (directSkill) {
    if (!args) {
      return { type: "insert-scaffold", text: `/skill ${directSkill} ` };
    }
    return {
      type: "send-rewritten",
      text: buildSkillScaffold(directSkill, args),
    };
  }

  return { type: "error", message: `Unknown command: /${name}` };
}

// ---------------------------------------------------------------------------
// Channel helpers
// ---------------------------------------------------------------------------

const CHANNEL_ALIAS_MAP: Record<string, CommandId> = {
  "eclaire-help": "help",
  "eclaire-new": "new",
  "eclaire-history": "history",
  "eclaire-model": "model",
  "eclaire-settings": "thinking",
  "eclaire-clear": "clear",
};

/**
 * Get the mapping from platform-prefixed channel command names to canonical
 * command ids. Used by Slack and Discord adapters.
 */
export function getChannelAliases(): ReadonlyMap<string, CommandId> {
  return new Map(Object.entries(CHANNEL_ALIAS_MAP)) as ReadonlyMap<
    string,
    CommandId
  >;
}

/**
 * Generate formatted help text from a list of slash items.
 */
export function generateHelpText(items: SlashItem[], prefix = ""): string {
  const groups = groupSlashItems(items);
  const sections: string[] = [];

  for (const group of groups) {
    const lines = group.items.map(
      (item) => `/${prefix}${item.id} — ${item.description}`,
    );
    sections.push(`${group.label}:\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}
