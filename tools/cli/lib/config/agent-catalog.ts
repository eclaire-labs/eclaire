/**
 * Agent catalog: static backend tools and discovered skills.
 * Tools are hardcoded (must match apps/backend/src/lib/agent/tools/index.ts).
 * Skills are discovered from the filesystem via @eclaire/ai.
 */

// Static backend tools (sync with apps/backend/src/lib/agent/tools/index.ts)
export const BUILTIN_TOOLS = [
  {
    name: "findContent",
    label: "Find Content",
    description: "Search across all content types with optional type filter",
  },
  {
    name: "findTasks",
    label: "Find Tasks",
    description: "Search tasks with status/schedule/delegate filters",
  },
  {
    name: "browseWeb",
    label: "Browse Web",
    description: "Browse and extract web pages",
  },
  {
    name: "browseChrome",
    label: "Browse Chrome",
    description: "Browse Chrome bookmarks/history",
  },
  { name: "getTask", label: "Get Task", description: "Get task details" },
  { name: "getNote", label: "Get Note", description: "Get note content" },
  {
    name: "getBookmark",
    label: "Get Bookmark",
    description: "Get bookmark details",
  },
  {
    name: "getTaskComments",
    label: "Get Task Comments",
    description: "Get comments on a task",
  },
  {
    name: "getDueItems",
    label: "Get Due Items",
    description: "Get upcoming due tasks",
  },
  {
    name: "createNote",
    label: "Create Note",
    description: "Create a new note",
  },
  {
    name: "createTask",
    label: "Create Task",
    description: "Create a new task",
  },
  {
    name: "createBookmark",
    label: "Create Bookmark",
    description: "Create a new bookmark",
  },
  {
    name: "updateTask",
    label: "Update Task",
    description: "Update an existing task",
  },
  {
    name: "updateNote",
    label: "Update Note",
    description: "Update an existing note",
  },
  {
    name: "updateBookmark",
    label: "Update Bookmark",
    description: "Update a bookmark",
  },
  {
    name: "addTaskComment",
    label: "Add Task Comment",
    description: "Add a comment to a task",
  },
  { name: "listTags", label: "List Tags", description: "List all tags" },
  {
    name: "loadSkill",
    label: "Load Skill",
    description: "Load a skill at runtime",
  },
];

// Also try to include MCP-sourced tool names from the database
import { getDb } from "../db/index.js";

export async function getAvailableTools(): Promise<
  { name: string; label: string; hint?: string }[]
> {
  const tools = BUILTIN_TOOLS.map((t) => ({
    name: t.name,
    label: t.label,
    hint: t.description,
  }));

  // Try to add MCP-sourced tools
  try {
    const { db, schema } = getDb();
    // biome-ignore lint/suspicious/noExplicitAny: DbInstance is a union type
    const servers = await (db as any).select().from(schema.mcpServers);
    for (const server of servers) {
      if (server.enabled) {
        tools.push({
          name: `mcp:${server.id}`,
          label: `MCP: ${server.name}`,
          hint: server.description || `Tools from ${server.name}`,
        });
      }
    }
  } catch {
    // DB not available, just use builtin tools
  }

  return tools;
}

export function getAvailableSkills(): {
  name: string;
  label: string;
  hint?: string;
}[] {
  // Skills are discovered from @eclaire/ai's skill registry, but the registry
  // needs skill sources to be registered first. In CLI context, we might not
  // have them registered. Try to discover from the default config location.
  try {
    // Import dynamically to avoid loading the full AI package at CLI startup
    // For now, return empty since skill sources aren't registered in CLI context.
    // Users can still type skill names manually.
    return [];
  } catch {
    return [];
  }
}
