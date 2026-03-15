/**
 * Agent Definition Base Types
 *
 * Core types for defining AI agents with system prompts, tools, and skills.
 * These are the reusable building blocks — consumers can extend
 * AgentDefinitionBase with persistence-specific fields (e.g. timestamps).
 */

export type AgentKind = "builtin" | "custom";

export interface AgentDefinitionBase {
  id: string;
  kind: AgentKind;
  name: string;
  description: string | null;
  systemPrompt: string;
  toolNames: string[];
  skillNames: string[];
}
