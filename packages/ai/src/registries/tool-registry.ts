/**
 * Tool Registry
 *
 * Dynamic registry for runtime tools with active tool set management
 * and prompt contribution aggregation.
 */

import type { RuntimeToolDefinition } from "../runtime/tools/types.js";

// =============================================================================
// REGISTRY
// =============================================================================

const tools = new Map<string, RuntimeToolDefinition>();
let activeToolNames: Set<string> | null = null; // null = all tools active

/**
 * Register a tool. Replaces existing tool with the same name.
 */
export function registerTool(tool: RuntimeToolDefinition): void {
  tools.set(tool.name, tool);
}

/**
 * Get a tool by name (only if it's active).
 */
export function getTool(name: string): RuntimeToolDefinition | undefined {
  const tool = tools.get(name);
  if (!tool) return undefined;
  if (activeToolNames && !activeToolNames.has(name)) return undefined;
  return tool;
}

/**
 * Get a tool by name regardless of active state (for introspection).
 */
export function getToolDefinition(
  name: string,
): RuntimeToolDefinition | undefined {
  return tools.get(name);
}

/**
 * Get all currently active tools.
 */
export function getActiveTools(): RuntimeToolDefinition[] {
  if (!activeToolNames) return Array.from(tools.values());
  return Array.from(tools.values()).filter((t) => activeToolNames?.has(t.name));
}

/**
 * Set which tools are active by name.
 * Pass null to activate all registered tools.
 */
export function setActiveTools(names: string[] | null): void {
  activeToolNames = names ? new Set(names) : null;
}

/**
 * Get all registered tool names.
 */
export function listTools(): string[] {
  return Array.from(tools.keys());
}

/**
 * Remove a registered tool.
 */
export function unregisterTool(name: string): boolean {
  return tools.delete(name);
}

/**
 * Check if a tool exists (regardless of active state).
 */
export function hasTool(name: string): boolean {
  return tools.has(name);
}

/**
 * Collect prompt contributions from all active tools.
 */
export function getPromptContributions(): {
  snippets: string[];
  guidelines: string[];
} {
  const activeTools = getActiveTools();
  const snippets: string[] = [];
  const guidelines: string[] = [];

  for (const tool of activeTools) {
    if (tool.promptSnippet) {
      snippets.push(tool.promptSnippet);
    }
    if (tool.promptGuidelines) {
      guidelines.push(...tool.promptGuidelines);
    }
  }

  return { snippets, guidelines };
}

/**
 * Clear all registered tools (for testing).
 */
export function clearTools(): void {
  tools.clear();
  activeToolNames = null;
}
